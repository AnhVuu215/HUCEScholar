import { expect, test, type Page } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { openReaderFixture, readerHeaders } from './helpers/reader-session';

const notebook = (page: Page) =>
  page.getByRole('region', { name: 'Sổ ghi chú phiên bản này', exact: true });
async function search(page: Page, text: string) {
  await notebook(page).getByLabel('Tìm trong ghi chú', { exact: true }).fill(text);
  await notebook(page).getByRole('button', { name: 'Tìm ghi chú', exact: true }).click();
}
test('marking "cần xem lại" keeps the open draft, filters the notebook and survives reload', async ({
  page,
}) => {
  const own = await openReaderFixture(page, 'review-later');
  const headers = await readerHeaders(page);
  for (const [pageNumber, content] of [
    [1, 'Đã hiểu phần mở đầu'],
    [2, 'Chưa hiểu điều kiện áp dụng'],
  ] as const)
    expect(
      (
        await page.request.post(`${own.path}/notes`, {
          headers,
          data: { pageNumber, content, requestId: randomUUID() },
        })
      ).status(),
    ).toBe(201);
  await page.goto(`${own.route}?page=1`);
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
  ).toBeVisible();
  const input = page.getByLabel('Nội dung ghi chú', { exact: true });
  await input.fill('Bản soạn còn nguyên');
  await page.getByRole('tab', { name: 'Toàn tài liệu', exact: true }).click();
  await expect(notebook(page).getByRole('article')).toHaveCount(2);
  const target = notebook(page)
    .getByRole('article')
    .filter({ hasText: 'Chưa hiểu điều kiện áp dụng' });
  await target.getByRole('button', { name: 'Đánh dấu cần xem lại', exact: true }).click();
  await expect(notebook(page).getByRole('status')).toHaveText('Đã đánh dấu cần xem lại · Trang 2.');
  await expect(target).toContainText('Cần xem lại');
  await expect(
    target.getByRole('button', { name: 'Bỏ dấu cần xem lại', exact: true }),
  ).toBeFocused();
  await notebook(page).getByLabel('Chỉ mục cần xem lại', { exact: true }).check();
  await search(page, '');
  await expect(notebook(page).getByRole('article')).toHaveCount(1);
  await expect(notebook(page).getByRole('article')).toContainText('Chưa hiểu điều kiện áp dụng');
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await notebook(page).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('tab', { name: 'Trang này', exact: true }).click();
  await expect(input).toHaveValue('Bản soạn còn nguyên');
  // A failed save leaves the mark as it was and says so.
  await page.getByRole('tab', { name: 'Toàn tài liệu', exact: true }).click();
  await page.route('**/review-later', (route) => route.abort('timedout'), { times: 1 });
  await notebook(page).getByRole('button', { name: 'Bỏ dấu cần xem lại', exact: true }).click();
  await expect(notebook(page).getByRole('status')).toContainText('Chưa lưu được dấu');
  await expect(notebook(page).getByRole('article')).toContainText('Cần xem lại');
  await page.getByRole('tab', { name: 'Trang này', exact: true }).click();
  await page.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
  await page.reload();
  await page.getByRole('tab', { name: 'Toàn tài liệu', exact: true }).click();
  await notebook(page).getByLabel('Chỉ mục cần xem lại', { exact: true }).check();
  await search(page, '');
  await expect(notebook(page).getByRole('article')).toHaveCount(1);
  await notebook(page).getByRole('button', { name: 'Bỏ dấu cần xem lại', exact: true }).click();
  await expect(notebook(page).getByRole('status')).toHaveText('Đã bỏ dấu cần xem lại · Trang 2.');
  // The unmarked item stays in view until the next search, then drops out of the filter.
  await expect(notebook(page).getByRole('article')).toHaveCount(1);
  await search(page, '');
  await expect(notebook(page).getByRole('article')).toHaveCount(0);
});
