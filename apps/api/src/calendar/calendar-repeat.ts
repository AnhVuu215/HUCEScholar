/**
 * CAL-02/CAL-07. Repeating items: weekly on chosen weekdays, or monthly on the first date's day
 * of the month, every `interval` weeks or months, until a last date and optionally at most
 * `count` times. Weekdays, dates and the last date are local to the UTC offset the owner's
 * device had when saving. Occurrence n starts a whole number of days (24 h) after the first.
 */
export const DAY = 86_400_000;
export const MAX_REPEAT_DAYS = 366;
export const MAX_REPEAT_INTERVAL = 12;
export const MAX_REPEAT_COUNT = 400;
export type RepeatFreq = 'WEEKLY' | 'MONTHLY';

export type Series = {
  start: Date;
  end: Date;
  /** Weekly only. Bit 0 = Monday … bit 6 = Sunday. */
  days: number;
  /** Last local date (inclusive) as UTC midnight, as PostgreSQL `date` comes back. */
  until: Date;
  /** Minutes east of UTC. */
  offset: number;
  /** Defaults keep CAL-02 series (weekly, every week, no count) working unchanged. */
  freq?: RepeatFreq;
  interval?: number;
  count?: number | null;
};

/** ISO weekdays (1 = Monday … 7 = Sunday) to the stored bitmask. */
export function weekdayMask(weekdays: number[]) {
  return weekdays.reduce((mask, day) => mask | (1 << (day - 1)), 0);
}
export function maskWeekdays(mask: number) {
  return [1, 2, 3, 4, 5, 6, 7].filter((day) => mask & (1 << (day - 1)));
}
/** `YYYY-MM-DD` to UTC midnight; null when it is not a real date. */
export function parseDate(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return date.getUTCMonth() === +m[2] - 1 && date.getUTCDate() === +m[3] ? date : null;
}
export function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
/** The local date of an instant, as UTC midnight. */
export function localDate(at: Date, offset: number) {
  const local = new Date(at.getTime() + offset * 60_000);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}
/** ISO weekday (1–7) of an instant at the given offset. */
export function localWeekday(at: Date, offset: number) {
  return ((new Date(localDate(at, offset)).getUTCDay() + 6) % 7) + 1;
}
/** Why a series cannot be stored, or null when it is valid. */
export function seriesProblem(series: Series) {
  const freq = series.freq ?? 'WEEKLY';
  const interval = series.interval ?? 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_REPEAT_INTERVAL)
    return `Khoảng lặp từ 1 tới ${MAX_REPEAT_INTERVAL}.`;
  if (freq === 'WEEKLY' && !(series.days & (1 << (localWeekday(series.start, series.offset) - 1))))
    return 'Ngày bắt đầu phải thuộc các thứ lặp lại.';
  const first = localDate(series.start, series.offset);
  if (series.until.getTime() < first) return 'Ngày kết thúc lặp phải từ ngày bắt đầu trở đi.';
  if (series.until.getTime() > first + MAX_REPEAT_DAYS * DAY)
    return `Lặp lại tối đa ${MAX_REPEAT_DAYS} ngày sau buổi đầu.`;
  return null;
}
/** Local day offsets (from the first date) of the candidate dates, in order, unbounded. */
function* candidateDays(series: Series) {
  const first = localDate(series.start, series.offset);
  const interval = series.interval ?? 1;
  if ((series.freq ?? 'WEEKLY') === 'MONTHLY') {
    const date = new Date(first);
    const day = date.getUTCDate();
    for (let n = 0; ; n++) {
      const month = date.getUTCMonth() + n * interval;
      const target = Date.UTC(date.getUTCFullYear(), month, day);
      // A month without that day (the 31st in April) has no occurrence.
      if (new Date(target).getUTCDate() !== day) continue;
      yield Math.round((target - first) / DAY);
    }
  }
  // Weeks are counted from the Monday of the first date's week.
  const monday = (new Date(first).getUTCDay() + 6) % 7;
  for (let d = 0; ; d++) {
    const week = Math.floor((monday + d) / 7);
    const iso = ((monday + d) % 7) + 1;
    if (week % interval === 0 && series.days & (1 << (iso - 1))) yield d;
  }
}
/** Start times (ms) of every occurrence, first one included, in order. */
export function* occurrenceStarts(series: Series) {
  const first = localDate(series.start, series.offset);
  let made = 0;
  for (const d of candidateDays(series)) {
    if (first + d * DAY > series.until.getTime()) return;
    if (series.count && made >= series.count) return;
    made++;
    yield series.start.getTime() + d * DAY;
  }
}
/** Occurrences overlapping [from, to), without the skipped ones. */
export function occurrencesIn(series: Series, from: Date, to: Date, skipped: Set<number>) {
  const length = series.end.getTime() - series.start.getTime();
  const found: { start: Date; end: Date }[] = [];
  for (const start of occurrenceStarts(series)) {
    if (start >= to.getTime()) break;
    const inside = length ? start + length > from.getTime() : start >= from.getTime();
    if (inside && !skipped.has(start))
      found.push({ start: new Date(start), end: new Date(start + length) });
  }
  return found;
}
export function isOccurrence(series: Series, at: Date) {
  for (const start of occurrenceStarts(series)) {
    if (start === at.getTime()) return true;
    if (start > at.getTime()) return false;
  }
  return false;
}
/**
 * "Sau N lần": the local date of the `count`-th occurrence within the longest allowed series,
 * or null when that many do not fit.
 */
export function lastOfCount(series: Omit<Series, 'until'>, count: number) {
  const until = new Date(localDate(series.start, series.offset) + MAX_REPEAT_DAYS * DAY);
  let n = 0;
  for (const start of occurrenceStarts({ ...series, until, count: null }))
    if (++n === count) return new Date(localDate(new Date(start), series.offset));
  return null;
}
/** A stored item's series, or null when it does not repeat. A repeating task has no length. */
export function rowSeries(row: {
  repeat_freq: string | null;
  repeat_days: number | null;
  repeat_until: Date | null;
  repeat_utc_offset: number | null;
  repeat_interval: number | null;
  repeat_count: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
}): Series | null {
  if (!row.repeat_freq || !row.starts_at || !row.repeat_until) return null;
  return {
    start: row.starts_at,
    end: row.ends_at ?? row.starts_at,
    days: row.repeat_days ?? 0,
    until: row.repeat_until,
    offset: row.repeat_utc_offset ?? 0,
    freq: row.repeat_freq as RepeatFreq,
    interval: row.repeat_interval ?? 1,
    count: row.repeat_count,
  };
}
