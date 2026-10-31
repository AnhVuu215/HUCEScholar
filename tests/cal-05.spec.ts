import { expect, test } from './helpers/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readerHeaders, readerLogin } from './helpers/reader-session';

async function download(page: Page) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Tải file .ics', exact: true }).click(),
  ]);
  expect(file.suggestedFilename()).toBe('hucescholar-lich-hoc.ics');
  return (await readFile((await file.path())!, 'utf8')).replace(/\r\n /g, '');
}

test('the calendar downloads as an .ics file, with notes only when ticked', async ({ page }) => {
  test.setTimeout(90_000);
  const run = randomUUID().slice(0, 8);
  await readerLogin(page, 'student', 'cal5');
  const created = await page.request.post('/api/v1/calendar/items', {
    headers: await readerHeaders(page),
    data: {
      kind: 'EVENT',
      title: `Học nhóm ${run}`,
      details: `Ghi chú riêng ${run}`,
      // Monday 7 June 2027, 07:00–08:30 in Hanoi, every Monday until 28 June.
      startsAt: '2027-06-07T00:00:00.000Z',
      endsAt: '2027-06-07T01:30:00.000Z',
      allDay: false,
      color: 'green',
      versionId: null,
      pageNumber: null,
      repeat: { weekdays: [1], until: '2027-06-28', utcOffset: 420 },
      requestId: randomUUID(),
    },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).item.id;

  await page.goto('/workspace/calendar');
  const panel = page.getByRole('complementary', { name: 'Xuất sang lịch khác' });
  await expect(panel.getByText('Chỉ có tiêu đề và thời gian.')).toBeVisible();
  const plain = await download(page);
  await expect(panel.getByRole('status')).toContainText('Đã tạo file lịch.');
  expect(plain).toContain(`UID:calendar-${id}@hucescholar`);
  expect(plain).toContain(`SUMMARY:Học nhóm ${run}`);
  expect(plain).toContain('RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=MO;UNTIL=20270628T165959Z');
  expect(plain).not.toContain(`Ghi chú riêng ${run}`);

  await panel.getByLabel('Kèm ghi chú và tên tài liệu liên kết', { exact: true }).check();
  await expect(panel.getByText(/Ghi chú, tên tài liệu và đường dẫn/)).toBeVisible();
  expect(await download(page)).toContain(`DESCRIPTION:Ghi chú riêng ${run}`);

  // A failed request says so in the panel instead of saving an error page.
  await page.route('**/api/v1/calendar/export?*', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Tải file .ics', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Chưa tải được file lịch.');
  await page.unroute('**/api/v1/calendar/export?*');

  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('an .ics file from another calendar is imported once, and the export takes a date range', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const run = randomUUID().slice(0, 8);
  await readerLogin(page, 'student', 'cal5');
  await page.goto('/workspace/calendar');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const ics = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const file = {
    name: 'lich-khac.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        `UID:${run}@other`,
        `DTSTART;TZID=Asia/Ho_Chi_Minh:${ics(tomorrow)}T070000`,
        `DTEND;TZID=Asia/Ho_Chi_Minh:${ics(tomorrow)}T080000`,
        `SUMMARY:Từ lịch khác ${run}`,
        'END:VEVENT',
        'BEGIN:VEVENT',
        `UID:${run}-yearly@other`,
        `DTSTART:${ics(tomorrow)}T020000Z`,
        'RRULE:FREQ=YEARLY',
        `SUMMARY:Hằng năm ${run}`,
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    ),
  };
  const panel = page.getByRole('complementary', { name: 'Nhập từ lịch khác' });
  await panel.getByLabel('File lịch (.ics)').setInputFiles(file);
  await expect(panel.getByRole('status')).toContainText('Đã thêm 2 mục.');
  await expect(panel.getByRole('status')).toContainText(`Hằng năm ${run}: Kiểu lặp này chưa có`);
  await page.getByRole('button', { name: 'Lịch biểu', exact: true }).click();
  await expect(
    page.locator('.calendar-agenda li').filter({ hasText: `Từ lịch khác ${run}` }),
  ).toHaveCount(1);
  // The same file again adds nothing.
  await panel.getByLabel('File lịch (.ics)').setInputFiles(file);
  await expect(panel.getByRole('status')).toContainText(
    'Đã thêm 0 mục, 2 mục đã có từ lần nhập trước.',
  );

  // Export only tomorrow: the imported session is in, today's items are not.
  const exporter = page.getByRole('complementary', { name: 'Xuất sang lịch khác' });
  await exporter.getByLabel('Chỉ xuất một khoảng ngày').check();
  await exporter.getByLabel('Từ ngày', { exact: true }).fill(key(tomorrow));
  await exporter.getByLabel('Đến ngày', { exact: true }).fill(key(tomorrow));
  await exporter.getByLabel('Kèm hạn danh sách đọc của các môn đang theo dõi').check();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exporter.getByRole('button', { name: 'Tải file .ics', exact: true }).click(),
  ]);
  const text = (await readFile((await download.path())!, 'utf8')).replace(/\r\n /g, '');
  expect(text).toContain(`SUMMARY:Từ lịch khác ${run}`);
  expect(text).not.toContain('SUMMARY:Học nhóm');
});
