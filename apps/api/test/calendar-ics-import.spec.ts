import { importRequestId, parseIcs, zoneOffset } from '../src/calendar/calendar-ics-import';

const VN = 420;
const wrap = (...lines: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n');

describe('CAL-07 iCalendar import', () => {
  it('reads a UTC session with an alarm, and unfolds long escaped lines', () => {
    const { items, skipped } = parseIcs(
      wrap(
        'BEGIN:VEVENT',
        'UID:abc@example',
        'DTSTART:20270906T020000Z',
        'DTEND:20270906T033000Z',
        'SUMMARY:Ôn Thủy lực\\, chương 2',
        'DESCRIPTION:Dòng một\\nDòng hai mang theo một ghi chú đủ dài để bị gập',
        ' dòng ở cột bảy mươi lăm',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'TRIGGER:-PT15M',
        'END:VALARM',
        'END:VEVENT',
      ),
      VN,
    );
    expect(skipped).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      uid: 'abc@example',
      fields: {
        kind: 'EVENT',
        title: 'Ôn Thủy lực, chương 2',
        details: 'Dòng một\nDòng hai mang theo một ghi chú đủ dài để bị gậpdòng ở cột bảy mươi lăm',
        startsAt: '2027-09-06T02:00:00.000Z',
        endsAt: '2027-09-06T03:30:00.000Z',
        allDay: false,
        repeat: null,
        remindMinutes: 15,
      },
    });
  });
  it('places TZID and floating times, and all-day dates at local midnight', () => {
    expect(zoneOffset('Asia/Ho_Chi_Minh', Date.UTC(2027, 0, 1))).toBe(420);
    expect(zoneOffset('Europe/Paris', Date.UTC(2027, 6, 1))).toBe(120);
    expect(zoneOffset('Not/AZone', 0)).toBeNull();
    const { items } = parseIcs(
      wrap(
        'BEGIN:VEVENT',
        'UID:tz',
        'DTSTART;TZID=Asia/Ho_Chi_Minh:20270906T090000',
        'DURATION:PT45M',
        'SUMMARY:Giờ Hà Nội',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:floating',
        'DTSTART:20270906T090000',
        'SUMMARY:Giờ máy',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:day',
        'DTSTART;VALUE=DATE:20270910',
        'SUMMARY:Ngày thi',
        'END:VEVENT',
      ),
      VN,
    );
    expect(items.map((i) => [i.fields.startsAt, i.fields.endsAt, i.fields.allDay])).toEqual([
      ['2027-09-06T02:00:00.000Z', '2027-09-06T02:45:00.000Z', false],
      ['2027-09-06T02:00:00.000Z', '2027-09-06T03:00:00.000Z', false],
      ['2027-09-09T17:00:00.000Z', '2027-09-10T17:00:00.000Z', true],
    ]);
  });
  it('maps weekly, daily and monthly rules, with removed dates, and cuts long series', () => {
    const { items } = parseIcs(
      wrap(
        'BEGIN:VEVENT',
        'UID:weekly',
        'DTSTART;TZID=Asia/Ho_Chi_Minh:20270906T070000',
        'DTEND;TZID=Asia/Ho_Chi_Minh:20270906T083000',
        'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20271201T000000Z',
        'EXDATE;TZID=Asia/Ho_Chi_Minh:20270908T070000',
        'SUMMARY:Học nhóm',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:daily',
        'DTSTART:20270906T020000Z',
        'RRULE:FREQ=DAILY;COUNT=5',
        'SUMMARY:Đọc mỗi ngày',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:monthly',
        'DTSTART:20270906T020000Z',
        'RRULE:FREQ=MONTHLY',
        'SUMMARY:Họp tháng',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:yearly',
        'DTSTART:20270906T020000Z',
        'RRULE:FREQ=YEARLY',
        'SUMMARY:Sinh nhật',
        'END:VEVENT',
      ),
      VN,
    );
    expect(items[0].fields.repeat).toEqual({
      freq: 'WEEKLY',
      interval: 2,
      weekdays: [1, 3],
      until: '2027-12-01',
      utcOffset: 420,
    });
    expect(items[0].skips).toEqual([Date.parse('2027-09-08T00:00:00.000Z')]);
    expect(items[1].fields.repeat).toEqual({
      freq: 'WEEKLY',
      interval: 1,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      count: 5,
      utcOffset: 0,
    });
    expect(items[2].fields.repeat).toMatchObject({ freq: 'MONTHLY', until: '2028-09-06' });
    expect(items[2].note).toMatch(/366 ngày/);
    expect(items[3].fields.repeat).toBeNull();
    expect(items[3].note).toMatch(/chỉ nhập lần đầu/);
  });
  it('reads tasks and reports what does not fit', () => {
    const { items, skipped } = parseIcs(
      wrap(
        'BEGIN:VTODO',
        'UID:todo',
        'DUE:20270910T100000Z',
        'SUMMARY:Nộp bài',
        'STATUS:COMPLETED',
        'END:VTODO',
        'BEGIN:VTODO',
        'UID:undated',
        'SUMMARY:Đọc thêm',
        'END:VTODO',
        'BEGIN:VEVENT',
        'UID:long',
        'DTSTART;VALUE=DATE:20270901',
        'DTEND;VALUE=DATE:20270930',
        'SUMMARY:Kỳ thực tập',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:weekly',
        'RECURRENCE-ID:20270908T000000Z',
        'DTSTART:20270908T010000Z',
        'SUMMARY:Buổi dời',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:bad',
        'DTSTART;TZID=Mars/Olympus:20270906T090000',
        'SUMMARY:Múi giờ lạ',
        'END:VEVENT',
      ),
      VN,
    );
    expect(items.map((i) => [i.fields.kind, i.fields.startsAt, i.done])).toEqual([
      ['TASK', '2027-09-10T10:00:00.000Z', true],
      ['TASK', null, false],
    ]);
    expect(skipped.map((s) => s.title)).toEqual(['Kỳ thực tập', 'Buổi dời', 'Múi giờ lạ']);
  });
  it('derives one request id per owner and UID', () => {
    const id = importRequestId('7', 'abc@example');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(importRequestId('7', 'abc@example')).toBe(id);
    expect(importRequestId('8', 'abc@example')).not.toBe(id);
  });
});
