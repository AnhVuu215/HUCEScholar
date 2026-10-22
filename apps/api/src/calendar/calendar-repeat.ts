/**
 * CAL-02. Weekly series: weekdays and the last date are local to the UTC offset the owner's
 * device had when saving. Occurrence n starts a whole number of days (24 h) after the first.
 */
export const DAY = 86_400_000;
export const MAX_REPEAT_DAYS = 366;

export type Series = {
  start: Date;
  end: Date;
  /** Bit 0 = Monday … bit 6 = Sunday. */
  days: number;
  /** Last local date (inclusive) as UTC midnight, as PostgreSQL `date` comes back. */
  until: Date;
  /** Minutes east of UTC. */
  offset: number;
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
  if (!(series.days & (1 << (localWeekday(series.start, series.offset) - 1))))
    return 'Ngày bắt đầu phải thuộc các thứ lặp lại.';
  const first = localDate(series.start, series.offset);
  if (series.until.getTime() < first) return 'Ngày kết thúc lặp phải từ ngày bắt đầu trở đi.';
  if (series.until.getTime() > first + MAX_REPEAT_DAYS * DAY)
    return `Lặp lại tối đa ${MAX_REPEAT_DAYS} ngày sau buổi đầu.`;
  return null;
}
/** Start times (ms) of every occurrence, first one included, in order. */
export function* occurrenceStarts(series: Series) {
  const first = localDate(series.start, series.offset);
  const weekday = new Date(first).getUTCDay();
  for (let d = 0; first + d * DAY <= series.until.getTime(); d++) {
    const iso = ((weekday + d + 6) % 7) + 1;
    if (series.days & (1 << (iso - 1))) yield series.start.getTime() + d * DAY;
  }
}
/** Occurrences overlapping [from, to), without the skipped ones. */
export function occurrencesIn(series: Series, from: Date, to: Date, skipped: Set<number>) {
  const length = series.end.getTime() - series.start.getTime();
  const found: { start: Date; end: Date }[] = [];
  for (const start of occurrenceStarts(series)) {
    if (start >= to.getTime()) break;
    if (start + length > from.getTime() && !skipped.has(start))
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
