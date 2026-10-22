import {
  isOccurrence,
  localWeekday,
  maskWeekdays,
  occurrenceStarts,
  occurrencesIn,
  parseDate,
  seriesProblem,
  weekdayMask,
  type Series,
} from '../src/calendar/calendar-repeat';

const VN = 420; // Asia/Ho_Chi_Minh, UTC+7
// Monday 2 Nov 2026 07:00 in Hanoi.
const start = new Date('2026-11-02T00:00:00.000Z');
const plan = (overrides: Partial<Series> = {}): Series => ({
  start,
  end: new Date('2026-11-02T01:30:00.000Z'),
  days: weekdayMask([1, 3]),
  until: parseDate('2026-11-18')!,
  offset: VN,
  ...overrides,
});
const iso = (ms: number) => new Date(ms).toISOString();

describe('CAL-02 weekly repeat', () => {
  it('maps ISO weekdays to a bitmask and back', () => {
    expect(weekdayMask([1, 7])).toBe(0b1000001);
    expect(maskWeekdays(weekdayMask([5, 2, 7]))).toEqual([2, 5, 7]);
  });
  it('accepts only real calendar dates', () => {
    expect(parseDate('2026-02-29')).toBeNull();
    expect(parseDate('2028-02-29')?.toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(parseDate('2026-1-2')).toBeNull();
  });
  it('uses the saved offset for the weekday, not UTC', () => {
    // 23:30 UTC Sunday is already Monday 06:30 in Hanoi.
    const late = new Date('2026-11-01T23:30:00.000Z');
    expect(localWeekday(late, 0)).toBe(7);
    expect(localWeekday(late, VN)).toBe(1);
  });
  it('lists Monday and Wednesday sessions through the last date, inclusive', () => {
    expect([...occurrenceStarts(plan())].map(iso)).toEqual([
      '2026-11-02T00:00:00.000Z',
      '2026-11-04T00:00:00.000Z',
      '2026-11-09T00:00:00.000Z',
      '2026-11-11T00:00:00.000Z',
      '2026-11-16T00:00:00.000Z',
      '2026-11-18T00:00:00.000Z',
    ]);
  });
  it('returns overlapping occurrences without skipped ones', () => {
    const skipped = new Set([Date.parse('2026-11-04T00:00:00.000Z')]);
    // The window starts inside the 2 Nov session, so it still counts.
    const found = occurrencesIn(
      plan(),
      new Date('2026-11-02T01:00:00.000Z'),
      new Date('2026-11-10T00:00:00.000Z'),
      skipped,
    );
    expect(found.map((o) => [o.start.toISOString(), o.end.toISOString()])).toEqual([
      ['2026-11-02T00:00:00.000Z', '2026-11-02T01:30:00.000Z'],
      ['2026-11-09T00:00:00.000Z', '2026-11-09T01:30:00.000Z'],
    ]);
  });
  it('recognises only real occurrence starts', () => {
    expect(isOccurrence(plan(), new Date('2026-11-11T00:00:00.000Z'))).toBe(true);
    expect(isOccurrence(plan(), new Date('2026-11-10T00:00:00.000Z'))).toBe(false);
    expect(isOccurrence(plan(), new Date('2026-11-11T00:30:00.000Z'))).toBe(false);
    expect(isOccurrence(plan(), new Date('2026-11-23T00:00:00.000Z'))).toBe(false);
  });
  it('requires the first day to repeat and the series to end within 366 days', () => {
    expect(seriesProblem(plan())).toBeNull();
    expect(seriesProblem(plan({ days: weekdayMask([2]) }))).toMatch(/thuộc các thứ/);
    expect(seriesProblem(plan({ until: parseDate('2026-11-01')! }))).toMatch(/từ ngày bắt đầu/);
    expect(seriesProblem(plan({ until: parseDate('2027-11-03')! }))).toBeNull();
    expect(seriesProblem(plan({ until: parseDate('2027-11-04')! }))).toMatch(/366/);
  });
});
