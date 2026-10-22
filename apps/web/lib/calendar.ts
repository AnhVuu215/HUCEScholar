import { ApiError, apiRequest, csrfToken } from './auth';

export const calendarColors = ['blue', 'green', 'orange', 'purple', 'red', 'gray'] as const;
export type CalendarColor = (typeof calendarColors)[number];
export const colorLabels: Record<CalendarColor, string> = {
  blue: 'Xanh dương',
  green: 'Xanh lá',
  orange: 'Cam',
  purple: 'Tím',
  red: 'Đỏ',
  gray: 'Xám',
};
export type CalendarKind = 'EVENT' | 'TASK';
/** CAL-02 weekly repeat as the API returns it; times are those of the first session. */
export type CalendarRepeat = {
  weekdays: number[];
  until: string;
  startsAt: string;
  endsAt: string;
};
/** What the form sends: ISO weekdays (1 = Monday), last local date, the device's UTC offset. */
export type CalendarRepeatInput = { weekdays: number[]; until: string; utcOffset: number };
export type CalendarItem = {
  id: string;
  kind: CalendarKind;
  title: string;
  details: string;
  /** EVENT: start. TASK: due time, or null for a task without a date. */
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  color: CalendarColor;
  done: boolean;
  /** Present only while the owner can still read the linked version. */
  material: { versionId: string; pageNumber: number; title: string } | null;
  materialUnavailable: boolean;
  repeat: CalendarRepeat | null;
  /** Original start of this occurrence of a repeating session; null for a single item. */
  occurrenceStart: string | null;
  revision: number;
  updatedAt: string;
};
export type CalendarFields = {
  kind: CalendarKind;
  title: string;
  details: string;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  color: CalendarColor;
  versionId: string | null;
  pageNumber: number | null;
  repeat?: CalendarRepeatInput | null;
};
export type CalendarRange = { items: CalendarItem[]; truncated: boolean };
export type CalendarTasks = { items: CalendarItem[]; total: number; page: number; limit: number };

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d*$/.test(v);
const time = (v: unknown) => v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
const repeat = (v: unknown) =>
  v === null ||
  (record(v) &&
    Array.isArray(v.weekdays) &&
    v.weekdays.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) &&
    typeof v.until === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.until) &&
    typeof v.startsAt === 'string' &&
    time(v.startsAt) &&
    typeof v.endsAt === 'string' &&
    time(v.endsAt));
function valid(v: unknown): v is CalendarItem {
  return (
    record(v) &&
    id(v.id) &&
    (v.kind === 'EVENT' || v.kind === 'TASK') &&
    typeof v.title === 'string' &&
    typeof v.details === 'string' &&
    time(v.startsAt) &&
    time(v.endsAt) &&
    typeof v.allDay === 'boolean' &&
    calendarColors.includes(v.color as CalendarColor) &&
    typeof v.done === 'boolean' &&
    (v.material === null ||
      (record(v.material) &&
        id(v.material.versionId) &&
        Number.isInteger(v.material.pageNumber) &&
        typeof v.material.title === 'string')) &&
    typeof v.materialUnavailable === 'boolean' &&
    repeat(v.repeat) &&
    time(v.occurrenceStart) &&
    Number.isInteger(v.revision) &&
    typeof v.updatedAt === 'string'
  );
}
async function send(path: string, method: string, body: object) {
  const token = await csrfToken();
  return apiRequest(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify(body),
  });
}
function item(body: unknown) {
  if (record(body) && valid(body.item)) return body.item;
  throw new Error('Invalid calendar item.');
}

export async function calendarRange(from: Date, to: Date, signal?: AbortSignal) {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  const body: unknown = await (await apiRequest(`/calendar/items?${params}`, { signal })).json();
  if (
    record(body) &&
    Array.isArray(body.items) &&
    body.items.every(valid) &&
    typeof body.truncated === 'boolean'
  )
    return body as unknown as CalendarRange;
  throw new Error('Invalid calendar range.');
}
export async function openTasks(signal?: AbortSignal) {
  const body: unknown = await (await apiRequest('/calendar/tasks?limit=100', { signal })).json();
  if (
    record(body) &&
    Array.isArray(body.items) &&
    body.items.every(valid) &&
    Number.isSafeInteger(body.total) &&
    Number.isInteger(body.page) &&
    Number.isInteger(body.limit)
  )
    return body as unknown as CalendarTasks;
  throw new Error('Invalid calendar tasks.');
}
export async function createCalendarItem(fields: CalendarFields, requestId: string) {
  return item(await (await send('/calendar/items', 'POST', { ...fields, requestId })).json());
}
/** `keepSource` keeps the stored link, including one withheld because access ended. */
export async function updateCalendarItem(
  current: CalendarItem,
  fields: CalendarFields,
  keepSource = false,
) {
  return item(
    await (
      await send(`/calendar/items/${encodeURIComponent(current.id)}`, 'PATCH', {
        ...fields,
        ...(keepSource ? { versionId: null, pageNumber: null, keepSource } : {}),
        revision: current.revision,
      })
    ).json(),
  );
}
/** "Xóa buổi này": removes one occurrence from its series. */
export async function skipOccurrence(current: CalendarItem) {
  await send(`/calendar/items/${encodeURIComponent(current.id)}/skip`, 'POST', {
    revision: current.revision,
    occurrenceStart: current.occurrenceStart,
  });
}
/** "Chỉ buổi này": the occurrence leaves its series as a single item with these fields. */
export async function detachOccurrence(
  current: CalendarItem,
  fields: CalendarFields,
  requestId: string,
  keepSource = false,
) {
  return item(
    await (
      await send(`/calendar/items/${encodeURIComponent(current.id)}/detach`, 'POST', {
        ...fields,
        ...(keepSource ? { versionId: null, pageNumber: null, keepSource } : {}),
        repeat: null,
        requestId,
        revision: current.revision,
        occurrenceStart: current.occurrenceStart,
      })
    ).json(),
  );
}
export async function setCalendarDone(current: CalendarItem, done: boolean) {
  return item(
    await (
      await send(`/calendar/items/${encodeURIComponent(current.id)}/done`, 'PUT', { done })
    ).json(),
  );
}
export async function deleteCalendarItem(current: CalendarItem) {
  await send(`/calendar/items/${encodeURIComponent(current.id)}`, 'DELETE', {
    revision: current.revision,
  });
}
export function calendarError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      window.location.replace('/login');
      return 'Phiên đăng nhập đã hết hạn.';
    }
    if (error.code === 'CALENDAR_CONFLICT')
      return 'Mục lịch đã thay đổi ở lượt khác. Tải lại lịch trước khi sửa.';
    if (error.code === 'CALENDAR_REQUEST_REUSED')
      return 'Yêu cầu tạo mục lịch đã được dùng. Tải lại để đối soát.';
    if (error.status === 404)
      return 'Mục lịch hoặc tài liệu liên kết không còn khả dụng. Tải lại rồi thử lại.';
    if (error.status === 400)
      return 'Kiểm tra lại: tiêu đề 1–200 ký tự, giờ kết thúc sau giờ bắt đầu, tối đa 14 ngày; lặp lại tối đa 366 ngày và gồm thứ của ngày bắt đầu.';
  }
  return 'Chưa xác nhận được với máy chủ. Nội dung vẫn còn trong ô; thử lại.';
}

/* Local-time date helpers. Weeks start on Monday. */
export const DAY_MS = 86_400_000;
export const weekdayLabels = ['Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7', 'CN'];
export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
export function startOfWeek(date: Date) {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() + 6) % 7));
}
export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
const pad = (n: number) => String(n).padStart(2, '0');
/** `YYYY-MM-DD` in local time, for `<input type="date">` and day keys. */
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function timeKey(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
/** Local date and optional `HH:MM` back to a Date; null when the inputs are incomplete. */
export function fromInputs(day: string, clock = '00:00') {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day),
    t = /^(\d{2}):(\d{2})$/.exec(clock);
  if (!d || !t) return null;
  const value = new Date(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  return Number.isNaN(value.getTime()) ? null : value;
}
export function formatTime(date: Date) {
  return `${date.getHours()}:${pad(date.getMinutes())}`;
}
export function formatDay(date: Date) {
  return `${weekdayLabels[(date.getDay() + 6) % 7]}, ${date.getDate()}/${date.getMonth() + 1}`;
}
export function formatLongDay(date: Date) {
  return `${formatDay(date)}/${date.getFullYear()}`;
}
/** When an item happens, as a short Vietnamese label. */
export function whenLabel(item: CalendarItem) {
  if (!item.startsAt) return 'Chưa có ngày';
  const start = new Date(item.startsAt);
  if (item.kind === 'TASK')
    return item.allDay ? `Hạn ${formatDay(start)}` : `Hạn ${formatDay(start)} ${formatTime(start)}`;
  const end = new Date(item.endsAt!);
  if (item.allDay) {
    const last = addDays(end, -1);
    return sameDay(start, last)
      ? `${formatDay(start)} · cả ngày`
      : `${formatDay(start)} – ${formatDay(last)}`;
  }
  return sameDay(start, end)
    ? `${formatDay(start)} · ${formatTime(start)}–${formatTime(end)}`
    : `${formatDay(start)} ${formatTime(start)} – ${formatDay(end)} ${formatTime(end)}`;
}
/** Visible span of an item: tasks are a point, all-day events cover whole days. */
export function itemSpan(item: CalendarItem) {
  const start = new Date(item.startsAt!);
  return { start, end: item.endsAt ? new Date(item.endsAt) : start };
}
/** Whether the item shows on a given local day. */
export function onDay(item: CalendarItem, day: Date) {
  if (!item.startsAt) return false;
  const { start, end } = itemSpan(item);
  const next = addDays(day, 1);
  return item.kind === 'TASK' ? start >= day && start < next : start < next && end > day;
}
export function overdue(item: CalendarItem, now: Date) {
  if (item.kind !== 'TASK' || item.done || !item.startsAt) return false;
  const due = new Date(item.startsAt);
  return item.allDay ? addDays(due, 1) <= now : due < now;
}
export function readerHref(material: { versionId: string; pageNumber: number }) {
  return `/workspace/library/versions/${material.versionId}?page=${material.pageNumber}`;
}

/** Stable key for one rendered occurrence; a series shares its id across sessions. */
export function itemKey(item: CalendarItem) {
  return item.occurrenceStart ? `${item.id}@${item.occurrenceStart}` : item.id;
}
/** ISO weekday (1 = Monday … 7 = Sunday) of a local date. */
export function isoWeekday(date: Date) {
  return ((date.getDay() + 6) % 7) + 1;
}
/** The device's offset in minutes east of UTC, as the API expects for a series. */
export function utcOffset(date: Date) {
  return -date.getTimezoneOffset();
}
export function repeatLabel(repeat: CalendarRepeat) {
  const [y, m, d] = repeat.until.split('-').map(Number);
  const days = repeat.weekdays.map((w) => weekdayLabels[w - 1]).join(', ');
  return `Lặp hằng tuần: ${days} · đến ${d}/${m}/${y}`;
}
/**
 * An item's own fields, for a move that changes only its time. A withheld link has no ids in the
 * browser, so the caller sends keepSource instead.
 */
export function itemFields(item: CalendarItem): { fields: CalendarFields; keepSource: boolean } {
  return {
    fields: {
      kind: item.kind,
      title: item.title,
      details: item.details,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      allDay: item.allDay,
      color: item.color,
      versionId: item.material?.versionId ?? null,
      pageNumber: item.material?.pageNumber ?? null,
      repeat: null,
    },
    keepSource: item.materialUnavailable,
  };
}
export const SNAP_MINUTES = 15;
/**
 * Where a dragged item lands. `minutes` is the slot on the hour grid (already corrected for where
 * the block was grabbed); null means a day without a time (all-day strip, month cell).
 */
export function droppedTimes(
  item: CalendarItem,
  day: Date,
  minutes: number | null,
): Pick<CalendarFields, 'startsAt' | 'endsAt' | 'allDay'> | null {
  const at = (m: number) => {
    const snapped = Math.round(m / SNAP_MINUTES) * SNAP_MINUTES;
    const clamped = Math.min(Math.max(snapped, 0), 24 * 60 - SNAP_MINUTES);
    const value = new Date(day);
    value.setMinutes(clamped);
    return value;
  };
  const start = item.startsAt ? new Date(item.startsAt) : null;
  let next: Pick<CalendarFields, 'startsAt' | 'endsAt' | 'allDay'>;
  if (item.kind === 'TASK') {
    if (minutes !== null)
      next = { startsAt: at(minutes).toISOString(), endsAt: null, allDay: false };
    else if (start && !item.allDay) {
      const due = new Date(day);
      due.setHours(start.getHours(), start.getMinutes());
      next = { startsAt: due.toISOString(), endsAt: null, allDay: false };
    } else next = { startsAt: day.toISOString(), endsAt: null, allDay: true };
  } else {
    const end = new Date(item.endsAt!);
    if (item.allDay && minutes !== null) {
      const from = at(minutes);
      next = {
        startsAt: from.toISOString(),
        endsAt: new Date(from.getTime() + 3_600_000).toISOString(),
        allDay: false,
      };
    } else if (item.allDay) {
      // Whole local days, so the span stays midnight to midnight.
      const shift = Math.round((day.getTime() - startOfDay(start!).getTime()) / DAY_MS);
      next = {
        startsAt: addDays(start!, shift).toISOString(),
        endsAt: addDays(end, shift).toISOString(),
        allDay: true,
      };
    } else {
      let from: Date;
      if (minutes !== null) from = at(minutes);
      else {
        from = new Date(day);
        from.setHours(start!.getHours(), start!.getMinutes());
      }
      next = {
        startsAt: from.toISOString(),
        endsAt: new Date(from.getTime() + end.getTime() - start!.getTime()).toISOString(),
        allDay: false,
      };
    }
  }
  return next.startsAt === item.startsAt &&
    next.endsAt === item.endsAt &&
    next.allDay === item.allDay
    ? null
    : next;
}
