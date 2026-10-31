import {
  DAY,
  localDate,
  localWeekday,
  maskWeekdays,
  occurrenceStarts,
  type Series,
} from './calendar-repeat';

/**
 * CAL-05. One iCalendar (RFC 5545) file of the owner's calendar, for importing into another
 * calendar app. Times are written in UTC; only all-day dates need the owner's UTC offset.
 */
export type IcsItem = {
  id: string;
  kind: 'EVENT' | 'TASK';
  title: string;
  details: string;
  start: Date;
  /** Null for a task: it has a due time, not a length. */
  end: Date | null;
  allDay: boolean;
  series: Series | null;
  /** Original starts (ms) removed from a series, including detached ones. */
  skipped: number[];
  remindMinutes: number | null;
  /** Readable linked page, or null when there is none or it is withheld. */
  material: { title: string; pageNumber: number; href: string } | null;
};
export type IcsOptions = {
  /** Minutes east of UTC, for all-day items outside a series. */
  offset: number;
  /** Include each item's notes and linked material. */
  details: boolean;
  now: Date;
};

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const pad = (n: number) => String(n).padStart(2, '0');
/** `YYYYMMDDTHHMMSSZ`. */
export function icsTime(at: Date) {
  return at
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}
/** `YYYYMMDD` of a UTC-midnight timestamp. */
function icsDate(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}
/** TEXT escaping: backslash, semicolon, comma and line breaks. */
export function icsText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}
/** Folds a content line at 75 octets without splitting a UTF-8 character. */
export function foldLine(line: string) {
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    // Continuation lines start with a space, which counts toward their 75 octets.
    if (size + bytes > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/**
 * A weekly series repeats every 24 h from its first start, so its weekdays are the local ones
 * shifted by however many days UTC is behind or ahead at that time of day.
 */
function rrule(series: Series, allDay: boolean) {
  const shift = allDay
    ? 0
    : (((series.start.getUTCDay() + 6) % 7) + 1 - localWeekday(series.start, series.offset) + 7) %
      7;
  const days = maskWeekdays(series.days)
    .map((day) => (day - 1 + shift) % 7)
    .sort()
    .map((index) => WEEKDAYS[index]);
  // The last local date is inclusive: until its end, as a UTC instant, or the date itself.
  const until = allDay
    ? icsDate(series.until.getTime())
    : icsTime(new Date(series.until.getTime() + DAY - series.offset * 60_000 - 1000));
  return `RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=${days.join(',')};UNTIL=${until}`;
}

function eventLines(item: IcsItem, options: IcsOptions, origin: string) {
  const offset = item.series?.offset ?? options.offset;
  const lines = [
    'BEGIN:VEVENT',
    `UID:calendar-${item.id}@hucescholar`,
    `DTSTAMP:${icsTime(options.now)}`,
  ];
  if (item.allDay) {
    const first = localDate(item.start, offset);
    // An all-day session stores the midnight after its last day, which is DTEND's meaning too.
    const end = item.end ? localDate(item.end, offset) : first + DAY;
    lines.push(
      `DTSTART;VALUE=DATE:${icsDate(first)}`,
      `DTEND;VALUE=DATE:${icsDate(Math.max(end, first + DAY))}`,
    );
  } else {
    lines.push(`DTSTART:${icsTime(item.start)}`);
    if (item.end) lines.push(`DTEND:${icsTime(item.end)}`);
  }
  const at = (start: number) =>
    item.allDay ? icsDate(localDate(new Date(start), offset)) : icsTime(new Date(start));
  const dateParam = item.allDay ? ';VALUE=DATE' : '';
  if (item.series) {
    const skipped = [...item.skipped].sort((a, b) => a - b);
    if ((item.series.freq ?? 'WEEKLY') === 'WEEKLY' && (item.series.interval ?? 1) === 1) {
      lines.push(rrule(item.series, item.allDay));
      for (const start of skipped) lines.push(`EXDATE${dateParam}:${at(start)}`);
    } else {
      // Every N weeks and monthly series are listed date by date: a rule in UTC would put a
      // session that starts before 07:00 in Vietnam into the wrong week or month day.
      const gone = new Set(skipped);
      const [first, ...rest] = [...occurrenceStarts(item.series)];
      const dates = rest.filter((start) => !gone.has(start)).map(at);
      if (dates.length) lines.push(`RDATE${dateParam}:${dates.join(',')}`);
      if (gone.has(first)) lines.push(`EXDATE${dateParam}:${at(first)}`);
    }
  }
  lines.push(`SUMMARY:${icsText(item.kind === 'TASK' ? `Việc: ${item.title}` : item.title)}`);
  if (options.details) {
    const description = [
      item.details,
      item.material
        ? `Tài liệu: ${item.material.title} · trang ${item.material.pageNumber}\n${origin}${item.material.href}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    if (description) lines.push(`DESCRIPTION:${icsText(description)}`);
  }
  lines.push(`TRANSP:${item.kind === 'TASK' ? 'TRANSPARENT' : 'OPAQUE'}`);
  if (item.remindMinutes !== null && !item.allDay)
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(item.title)}`,
      `TRIGGER:-PT${item.remindMinutes}M`,
      'END:VALARM',
    );
  lines.push('END:VEVENT');
  return lines;
}

/** The whole file, CRLF line endings, lines folded. */
export function calendarIcs(items: IcsItem[], options: IcsOptions, origin: string) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HUCEScholar//Lich hoc//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText('HUCEScholar — Lịch học')}`,
    ...items.flatMap((item) => eventLines(item, options, origin)),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
