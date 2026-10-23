import { dueStarts, reminderKey } from '../src/calendar/calendar-reminders';
import { parseDate, weekdayMask, type Series } from '../src/calendar/calendar-repeat';

const MIN = 60_000;
// Monday 2 Nov 2026 07:00 in Hanoi (UTC+7).
const start = new Date('2026-11-02T00:00:00.000Z');
const series: Series = {
  start,
  end: new Date('2026-11-02T01:30:00.000Z'),
  days: weekdayMask([1, 3]),
  until: parseDate('2026-11-18')!,
  offset: 420,
};
const at = (iso: string) => Date.parse(iso);
const iso = (ms: number) => new Date(ms).toISOString();

describe('CAL-03 reminders', () => {
  it('is due once the lead time has passed, within the look-back window', () => {
    const item = { start, minutes: 15, series: null, skipped: new Set<number>() };
    const due = start.getTime() - 15 * MIN;
    expect(dueStarts(item, due - 10 * MIN, due - 1)).toEqual([]);
    expect(dueStarts(item, due - 10 * MIN, due)).toEqual([start.getTime()]);
    expect(dueStarts(item, due - 1, due + 9 * MIN)).toEqual([start.getTime()]);
    // The window is half-open: a reminder exactly at its lower edge belonged to the last tick.
    expect(dueStarts(item, due, due + 10 * MIN)).toEqual([]);
  });
  it('reminds at the start itself with 0 minutes', () => {
    const item = { start, minutes: 0, series: null, skipped: new Set<number>() };
    expect(dueStarts(item, start.getTime() - MIN, start.getTime())).toEqual([start.getTime()]);
  });
  it('finds the occurrence of a series whose reminder is due, not the first one', () => {
    const item = { start, minutes: 60, series, skipped: new Set<number>() };
    // Wednesday 4 Nov 07:00 Hanoi; reminder at 06:00 = 23:00 UTC on the 3rd.
    const wednesday = at('2026-11-04T00:00:00.000Z');
    expect(dueStarts(item, wednesday - 65 * MIN, wednesday - 59 * MIN).map(iso)).toEqual([
      '2026-11-04T00:00:00.000Z',
    ]);
    expect(dueStarts(item, wednesday - 30 * MIN, wednesday)).toEqual([]);
  });
  it('skips removed occurrences and stops after the last date', () => {
    const wednesday = at('2026-11-04T00:00:00.000Z');
    const skipped = { start, minutes: 0, series, skipped: new Set([wednesday]) };
    expect(dueStarts(skipped, wednesday - MIN, wednesday)).toEqual([]);
    const after = at('2026-11-23T00:00:00.000Z');
    const plain = { start, minutes: 0, series, skipped: new Set<number>() };
    expect(dueStarts(plain, after - MIN, after)).toEqual([]);
  });
  it('keys a notice by item and occurrence start in seconds', () => {
    expect(reminderKey(12n, start.getTime())).toBe(`reminder:12:${start.getTime() / 1000}`);
    expect(reminderKey(12n, start.getTime())).toMatch(/^[a-z]+:[1-9][0-9]*(:[1-9][0-9]*)?$/);
  });
});
