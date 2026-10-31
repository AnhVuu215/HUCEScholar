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
