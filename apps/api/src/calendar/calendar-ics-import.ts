import { createHash } from 'node:crypto';
import { DAY, formatDate, localDate, MAX_REPEAT_COUNT, MAX_REPEAT_DAYS } from './calendar-repeat';

/**
 * CAL-07. Reads the parts of an iCalendar (RFC 5545) file that fit this calendar: VEVENT as
 * study sessions, VTODO as tasks, weekly/monthly/daily rules that map onto our series, EXDATE as
 * removed occurrences and one display alarm. Everything else is reported, never guessed.
 */
export const MAX_IMPORT_BYTES = 512 * 1024;
export const MAX_IMPORT_ITEMS = 500;
const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const TIMED_LEADS = [0, 5, 10, 15, 30, 60, 120, 1440];

type Property = { name: string; params: Record<string, string>; value: string };
export type ImportedFields = {
  kind: 'EVENT' | 'TASK';
  title: string;
  details: string;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  color: 'gray';
  versionId: null;
  pageNumber: null;
  repeat: {
    freq: 'WEEKLY' | 'MONTHLY';
    interval: number;
    weekdays: number[];
    until?: string;
    count?: number;
    utcOffset: number;
  } | null;
  remindMinutes: number | null;
  remindMore: number[];
  remindEmail: false;
};
export type ImportedItem = {
  uid: string;
  fields: ImportedFields;
  /** Removed occurrence starts (ms) of a series. */
  skips: number[];
  done: boolean;
  /** Something was adapted, e.g. a series cut to 366 days. */
  note: string | null;
};
export type ImportResult = { items: ImportedItem[]; skipped: { title: string; reason: string }[] };

/** Joins folded lines (CRLF or LF followed by a space or tab). */
function unfold(text: string) {
  return text
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}
function property(line: string): Property | null {
  const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  if (colon < 0) return null;
  const [name, ...rest] = line.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const part of rest) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}
export function unescapeText(value: string) {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}
/** Minutes east of UTC that `zone` has at the UTC instant `at`, or null for an unknown zone. */
export function zoneOffset(zone: string, at: number) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(at));
    const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    return Math.round((asUtc - Math.floor(at / 60_000) * 60_000) / 60_000);
  } catch {
    return null;
  }
}
type When = { at: number; date: boolean; offset: number };
/**
 * A DATE or DATE-TIME value: UTC with Z, local to TZID, or floating (the importer's offset).
 * A date is local midnight at `fallback`, like an all-day item made in this app.
 */
function when(p: Property, fallback: number): When | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(p.value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const wall = Date.UTC(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0), +(s ?? 0));
  if (Number.isNaN(wall)) return null;
  if (h === undefined || p.params.VALUE === 'DATE')
    return { at: wall - fallback * 60_000, date: true, offset: fallback };
  if (z) return { at: wall, date: false, offset: 0 };
  if (p.params.TZID) {
    // The offset at the wall time, found from a first guess at the offset an hour around it.
    const guess = zoneOffset(p.params.TZID, wall);
    if (guess === null) return null;
    const offset = zoneOffset(p.params.TZID, wall - guess * 60_000) ?? guess;
    return { at: wall - offset * 60_000, date: false, offset };
  }
  return { at: wall - fallback * 60_000, date: false, offset: fallback };
}
function duration(value: string) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m;
  const ms =
    ((+(w ?? 0) * 7 + +(d ?? 0)) * 1440 + +(h ?? 0) * 60 + +(mi ?? 0)) * 60_000 + +(s ?? 0) * 1000;
  return sign === '-' ? -ms : ms;
}
/** A stable request id per owner and UID, so importing the same file twice adds nothing. */
export function importRequestId(ownerId: string, uid: string) {
  const hex = createHash('sha256').update(`hucescholar:ics:${ownerId}:${uid}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function parseIcs(text: string, fallbackOffset: number): ImportResult {
  const result: ImportResult = { items: [], skipped: [] };
  let block: Property[] | null = null;
  let kind: 'VEVENT' | 'VTODO' | null = null;
  let alarm: Property[] | null = null;
  const alarms: Property[][] = [];
  for (const line of unfold(text)) {
    const p = property(line);
    if (!p) continue;
    if (p.name === 'BEGIN' && (p.value === 'VEVENT' || p.value === 'VTODO') && !block) {
      block = [];
      kind = p.value;
      alarms.length = 0;
    } else if (p.name === 'BEGIN' && p.value === 'VALARM' && block) alarm = [];
    else if (p.name === 'END' && p.value === 'VALARM' && alarm) {
      alarms.push(alarm);
      alarm = null;
    } else if (p.name === 'END' && block && p.value === kind) {
      if (result.items.length + result.skipped.length >= MAX_IMPORT_ITEMS) {
        result.skipped.push({
          title: '',
          reason: `Chỉ nhập ${MAX_IMPORT_ITEMS} mục đầu của file.`,
        });
        break;
      }
      const item = toItem(block, kind!, [...alarms], fallbackOffset);
      if ('reason' in item) result.skipped.push(item);
      else result.items.push(item);
      block = null;
      kind = null;
    } else if (alarm) alarm.push(p);
    else if (block) block.push(p);
  }
  return result;
}

function toItem(
  props: Property[],
  kind: 'VEVENT' | 'VTODO',
  alarms: Property[][],
  fallback: number,
): ImportedItem | { title: string; reason: string } {
  const one = (name: string) => props.find((p) => p.name === name);
  const title =
    unescapeText(one('SUMMARY')?.value ?? '')
      .trim()
      .slice(0, 200) || '(Không có tiêu đề)';
  const skip = (reason: string) => ({ title, reason });
  if (one('RECURRENCE-ID')) return skip('Buổi được sửa riêng trong một chuỗi; chưa nhập loại này.');
  if (one('RDATE')) return skip('Chuỗi có ngày lặp liệt kê riêng (RDATE); chưa nhập loại này.');
  const uid = one('UID')?.value.trim() || `${title}:${one('DTSTART')?.value ?? ''}`;
  const details = unescapeText(one('DESCRIPTION')?.value ?? '')
    .trim()
    .slice(0, 2000);
  let note: string | null = null;
  const startProp = kind === 'VTODO' ? (one('DUE') ?? one('DTSTART')) : one('DTSTART');
  const start = startProp ? when(startProp, fallback) : null;
  if (startProp && !start) return skip('Không đọc được ngày giờ (múi giờ lạ hoặc sai định dạng).');
  if (kind === 'VEVENT' && !start) return skip('Lịch học thiếu giờ bắt đầu.');
  let endsAt: string | null = null;
  if (kind === 'VEVENT') {
    const endProp = one('DTEND');
    const end = endProp ? when(endProp, fallback) : null;
    const length = end
      ? end.at - start!.at
      : one('DURATION')
        ? duration(one('DURATION')!.value)
        : start!.date
          ? DAY
          : 3_600_000;
    if (length === null || length <= 0) return skip('Giờ kết thúc không sau giờ bắt đầu.');
    if (length > 14 * DAY) return skip('Kéo dài hơn 14 ngày.');
    endsAt = new Date(start!.at + length).toISOString();
  }
  const allDay = !!start?.date;
  let repeat: ImportedFields['repeat'] = null;
  const rule = one('RRULE');
  if (rule && start) {
    const parts = Object.fromEntries(
      rule.value.split(';').map((kv) => kv.split('=') as [string, string]),
    );
    const interval = parts.INTERVAL ? Number(parts.INTERVAL) : 1;
    const offset = start.offset;
    let freq: 'WEEKLY' | 'MONTHLY' | null = null;
    let weekdays: number[] = [];
    const firstDay = new Date(localDate(new Date(start.at), offset));
    const startWeekday = ((firstDay.getUTCDay() + 6) % 7) + 1;
    if (parts.FREQ === 'DAILY' && interval === 1 && !parts.BYDAY) {
      freq = 'WEEKLY';
      weekdays = [1, 2, 3, 4, 5, 6, 7];
    } else if (
      parts.FREQ === 'WEEKLY' &&
      (!parts.BYDAY || /^(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*$/.test(parts.BYDAY))
    ) {
      freq = 'WEEKLY';
      weekdays = parts.BYDAY
        ? [
            ...new Set([
              ...parts.BYDAY.split(',').map((d: string) => WEEKDAYS.indexOf(d) + 1),
              startWeekday,
            ]),
          ]
        : [startWeekday];
    } else if (
      parts.FREQ === 'MONTHLY' &&
      !parts.BYDAY &&
      (!parts.BYMONTHDAY || Number(parts.BYMONTHDAY) === firstDay.getUTCDate())
    )
      freq = 'MONTHLY';
    if (!freq || !Number.isInteger(interval) || interval < 1 || interval > 12)
      note = 'Kiểu lặp này chưa có ở đây; chỉ nhập lần đầu.';
    else {
      const longest = localDate(new Date(start.at), offset) + MAX_REPEAT_DAYS * DAY;
      let until: string | undefined;
      let count: number | undefined;
      if (parts.COUNT) {
        count = Math.min(Number(parts.COUNT), MAX_REPEAT_COUNT);
        if (Number(parts.COUNT) > MAX_REPEAT_COUNT) note = `Rút còn ${MAX_REPEAT_COUNT} lần.`;
      } else {
        const end = parts.UNTIL
          ? when({ name: 'UNTIL', params: {}, value: parts.UNTIL }, offset)
          : null;
        const last = end ? localDate(new Date(end.at), offset) : longest;
        if (last > longest || !end) note = `Rút còn ${MAX_REPEAT_DAYS} ngày sau lần đầu.`;
        until = formatDate(new Date(Math.min(last, longest)));
      }
      repeat = {
        freq,
        interval,
        weekdays: freq === 'WEEKLY' ? weekdays.sort() : [],
        ...(count ? { count } : { until }),
        utcOffset: offset,
      };
    }
  }
  // One display alarm before the start becomes the reminder when its lead is one we offer.
  let remind: number | null = null;
  for (const a of alarms) {
    const trigger = a.find((p) => p.name === 'TRIGGER');
    const lead = trigger && !trigger.params.VALUE ? duration(trigger.value) : null;
    const minutes = lead === null ? null : -lead / 60_000;
    if (minutes !== null && !allDay && TIMED_LEADS.includes(minutes)) {
      remind = minutes;
      break;
    }
  }
  const skips = props
    .filter((p) => p.name === 'EXDATE')
    .flatMap((p) =>
      p.value.split(',').map((value) => when({ ...p, value }, start?.offset ?? fallback)),
    )
    .filter((w): w is When => !!w)
    .map((w) => w.at);
  return {
    uid,
    fields: {
      kind: kind === 'VEVENT' ? 'EVENT' : 'TASK',
      title,
      details,
      startsAt: start ? new Date(start.at).toISOString() : null,
      endsAt,
      allDay: kind === 'VTODO' ? allDay && !!start : allDay,
      color: 'gray',
      versionId: null,
      pageNumber: null,
      repeat,
      remindMinutes: remind,
      remindMore: [],
      remindEmail: false,
    },
    skips: repeat ? skips : [],
    done: kind === 'VTODO' && /^COMPLETED$/i.test(one('STATUS')?.value ?? '') && !repeat,
    note,
  };
}
