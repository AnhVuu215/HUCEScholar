/** STUDY-03. Days until the next review after reaching box 1, 2, … 6. */
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60] as const;
export const MAX_REVIEW_BOX = REVIEW_INTERVALS.length;
export type ReviewResult = 'KNOWN' | 'AGAIN';

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The Vietnam calendar day of an instant, as YYYY-MM-DD: a card falls due at local midnight. */
export const localDay = (now: Date) => dayFormat.format(now);
/** A `date` column value: Prisma reads and writes these as UTC midnight. */
export const dayValue = (day: string) => new Date(`${day}T00:00:00.000Z`);
export const dayText = (value: Date) => value.toISOString().slice(0, 10);
export function addDays(day: string, days: number) {
  const value = dayValue(day);
  value.setUTCDate(value.getUTCDate() + days);
  return dayText(value);
}

/** "Nhớ" moves a card up one box; "Chưa nhớ" sends it back to the first, due tomorrow. */
export function nextReview(box: number, result: ReviewResult, today: string) {
  const next = result === 'KNOWN' ? Math.min(box + 1, MAX_REVIEW_BOX) : 1;
  return { box: next, dueOn: addDays(today, REVIEW_INTERVALS[next - 1]) };
}
