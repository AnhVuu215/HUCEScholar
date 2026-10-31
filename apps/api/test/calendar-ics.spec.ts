import { calendarIcs, foldLine, icsText, type IcsItem } from '../src/calendar/calendar-ics';
import { parseDate, weekdayMask } from '../src/calendar/calendar-repeat';

const VN = 420; // Asia/Ho_Chi_Minh, UTC+7
const now = new Date('2026-10-31T05:00:00.000Z');
const origin = 'https://scholar.example.test';
const item = (overrides: Partial<IcsItem> = {}): IcsItem => ({
  id: '7',
  kind: 'EVENT',
  title: 'Cơ học đất',
  details: '',
  start: new Date('2026-11-02T00:00:00.000Z'), // Monday 07:00 in Hanoi
  end: new Date('2026-11-02T01:30:00.000Z'),
  allDay: false,
  series: null,
  skipped: [],
  remindMinutes: null,
  material: null,
  ...overrides,
});
const file = (items: IcsItem[], details = false) =>
  calendarIcs(items, { offset: VN, details, now }, origin);
/** Unfolded content lines. */
const lines = (text: string) => text.replace(/\r\n /g, '').split('\r\n');

describe('CAL-05 iCalendar export', () => {
  it('writes a calendar with CRLF lines and one UTC-timed event', () => {
    const text = file([item()]);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
    expect(lines(text)).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//HUCEScholar//Lich hoc//VI',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:HUCEScholar — Lịch học',
      'BEGIN:VEVENT',
      'UID:calendar-7@hucescholar',
      'DTSTAMP:20261031T050000Z',
      'DTSTART:20261102T000000Z',
      'DTEND:20261102T013000Z',
      'SUMMARY:Cơ học đất',
      'TRANSP:OPAQUE',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ]);
  });
  it('escapes text and folds long lines on character boundaries', () => {
    expect(icsText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
    const long = `SUMMARY:${'Đọc chương '.repeat(20)}`;
    const folded = foldLine(long);
    for (const part of folded.split('\r\n'))
      expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });
  it('keeps notes and linked material out unless asked', () => {
    const linked = item({
      details: 'Mang máy tính; ôn chương 2',
      material: {
        title: 'Giáo trình',
        pageNumber: 12,
        href: '/workspace/library/versions/9?page=12',
      },
    });
    expect(file([linked])).not.toContain('DESCRIPTION');
    expect(lines(file([linked], true))).toContain(
      'DESCRIPTION:Mang máy tính\\; ôn chương 2\\n\\nTài liệu: Giáo trình · trang 12\\n' +
        `${origin}/workspace/library/versions/9?page=12`,
    );
  });
  it('dates all-day items with the given offset and makes DTEND exclusive', () => {
    // Stored as Hanoi midnight 3 Nov … midnight after 4 Nov.
    const text = lines(
      file([
        item({
          allDay: true,
          start: new Date('2026-11-02T17:00:00.000Z'),
          end: new Date('2026-11-04T17:00:00.000Z'),
        }),
        item({
          id: '8',
          kind: 'TASK',
          allDay: true,
          start: new Date('2026-11-05T17:00:00.000Z'),
          end: null,
        }),
      ]),
    );
    expect(text).toContain('DTSTART;VALUE=DATE:20261103');
    expect(text).toContain('DTEND;VALUE=DATE:20261105');
    expect(text).toContain('DTSTART;VALUE=DATE:20261106');
    expect(text).toContain('DTEND;VALUE=DATE:20261107');
  });
  it('writes a timed task as a point in time marked free, with its reminder', () => {
    const text = lines(
      file([
        item({
          kind: 'TASK',
          title: 'Nộp báo cáo',
          start: new Date('2026-11-06T16:59:00.000Z'),
          end: null,
          remindMinutes: 60,
        }),
      ]),
    );
    expect(text).toContain('DTSTART:20261106T165900Z');
    expect(text.some((l) => l.startsWith('DTEND'))).toBe(false);
    expect(text).toContain('SUMMARY:Việc: Nộp báo cáo');
    expect(text).toContain('TRANSP:TRANSPARENT');
    expect(text).toContain('TRIGGER:-PT60M');
  });
  it('writes a series as a weekly rule with skipped sessions excluded', () => {
    const series = {
      start: new Date('2026-11-02T00:00:00.000Z'),
      end: new Date('2026-11-02T01:30:00.000Z'),
      days: weekdayMask([1, 3]),
      until: parseDate('2026-11-18')!,
      offset: VN,
    };
    const text = lines(file([item({ series, skipped: [Date.parse('2026-11-04T00:00:00.000Z')] })]));
    // The last session is Wednesday 18 Nov; UNTIL is the end of that day in Hanoi.
    expect(text).toContain('RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=MO,WE;UNTIL=20261118T165959Z');
    expect(text).toContain('EXDATE:20261104T000000Z');
  });
  it('shifts the weekdays when the local session starts on the previous UTC day', () => {
    // Monday and Thursday 06:30 in Hanoi are Sunday and Wednesday 23:30 UTC.
    const series = {
      start: new Date('2026-11-01T23:30:00.000Z'),
      end: new Date('2026-11-02T00:30:00.000Z'),
      days: weekdayMask([1, 4]),
      until: parseDate('2026-11-30')!,
      offset: VN,
    };
    expect(lines(file([item({ series, start: series.start, end: series.end })]))).toContain(
      'RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=WE,SU;UNTIL=20261130T165959Z',
    );
  });
  it('keeps an all-day series on local dates', () => {
    const series = {
      start: new Date('2026-11-01T17:00:00.000Z'),
      end: new Date('2026-11-02T17:00:00.000Z'),
      days: weekdayMask([1]),
      until: parseDate('2026-11-23')!,
      offset: VN,
    };
    const text = lines(
      file([
        item({
          allDay: true,
          series,
          start: series.start,
          end: series.end,
          skipped: [Date.parse('2026-11-08T17:00:00.000Z')],
        }),
      ]),
    );
    expect(text).toContain('DTSTART;VALUE=DATE:20261102');
    expect(text).toContain('RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=MO;UNTIL=20261123');
    expect(text).toContain('EXDATE;VALUE=DATE:20261109');
  });
  it('lists every-other-week and monthly series date by date', () => {
    const series = {
      start: new Date('2026-10-31T00:00:00.000Z'),
      end: new Date('2026-10-31T01:00:00.000Z'),
      days: 0,
      until: parseDate('2027-01-31')!,
      offset: VN,
      freq: 'MONTHLY' as const,
    };
    const text = lines(
      file([
        item({
          series,
          start: series.start,
          end: series.end,
          skipped: [Date.parse('2026-12-31T00:00:00.000Z')],
        }),
      ]),
    );
    expect(text.some((l) => l.startsWith('RRULE'))).toBe(false);
    expect(text).toContain('RDATE:20270131T000000Z');
    // A removed first occurrence is excluded from DTSTART.
    const skipFirst = lines(
      file([
        item({ series, start: series.start, end: series.end, skipped: [series.start.getTime()] }),
      ]),
    );
    expect(skipFirst).toContain('EXDATE:20261031T000000Z');
    expect(skipFirst).toContain('RDATE:20261231T000000Z,20270131T000000Z');
  });
});
