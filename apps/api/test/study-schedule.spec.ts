import { addDays, localDay, MAX_REVIEW_BOX, nextReview } from '../src/study/study-schedule';

describe('study card schedule', () => {
  const today = '2026-11-04';

  it('walks a remembered card through every box, then stays on the longest gap', () => {
    const seen: [number, string][] = [];
    let box = 0;
    for (let round = 0; round < MAX_REVIEW_BOX + 1; round++) {
      const next = nextReview(box, 'KNOWN', today);
      seen.push([next.box, next.dueOn]);
      box = next.box;
    }
    expect(seen).toEqual([
      [1, '2026-11-05'],
      [2, '2026-11-07'],
      [3, '2026-11-11'],
      [4, '2026-11-18'],
      [5, '2026-12-04'],
      [6, '2027-01-03'],
      [6, '2027-01-03'],
    ]);
  });
  it('sends a forgotten card back to the first box, due tomorrow, from any box', () => {
    for (const box of [0, 1, 4, MAX_REVIEW_BOX])
      expect(nextReview(box, 'AGAIN', today)).toEqual({ box: 1, dueOn: '2026-11-05' });
  });
  it('counts days on the Vietnam calendar, not UTC', () => {
    expect(localDay(new Date('2026-11-04T16:59:59Z'))).toBe('2026-11-04');
    expect(localDay(new Date('2026-11-04T17:00:00Z'))).toBe('2026-11-05');
  });
  it('crosses month and leap-year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});
