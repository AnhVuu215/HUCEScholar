import { expect, test, type Page } from './helpers/test';
import { openReaderFixture, readerLogin, readerLogout } from './helpers/reader-session';

async function report(page: Page, category: string, description: string) {
  await page.getByRole('button', { name: 'Báo cáo vấn đề với tài liệu', exact: true }).click();
  await expect(page.getByLabel('Loại vấn đề', { exact: true })).toBeFocused();
  await page.getByLabel('Loại vấn đề', { exact: true }).selectOption({ label: category });
  await page.getByLabel('Mô tả', { exact: true }).fill(description);
  await page.getByRole('button', { name: 'Gửi báo cáo', exact: true }).click();
}

async function openReport(page: Page, title: string, status: string) {
  await page.goto('/workspace/admin/reports');
  await page.getByLabel('Trạng thái', { exact: true }).selectOption({ label: status });
  await page.getByLabel('Tìm theo tiêu đề tài liệu', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: title }).first();
  await row.getByRole('button', { name: /^Xem báo cáo/ }).click();
  await expect(page.getByRole('heading', { name: `Báo cáo · ${title}` })).toBeFocused();
}

test('readers report a version and admins dismiss or resolve with hiding', async ({ page }) => {
  test.setTimeout(120_000);
  const { versionId, route } = await openReaderFixture(page, 'reports');
  const title = (await page.getByRole('heading', { level: 2 }).first().textContent())!;
  await page.getByRole('button', { name: 'Báo cáo vấn đề với tài liệu', exact: true }).click();
  await page.getByRole('button', { name: 'Gửi báo cáo', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Chọn loại vấn đề' })).toBeFocused();
  await page.getByRole('button', { name: 'Hủy báo cáo', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Báo cáo vấn đề với tài liệu', exact: true }),
  ).toBeFocused();

  await report(page, 'File lỗi, thiếu trang hoặc chữ mờ', 'Trang 2 bị mờ khi phóng to.');
  await expect(page.getByRole('status').filter({ hasText: 'Đã gửi báo cáo.' })).toBeVisible();
  const mine = page.getByRole('list', { name: 'Báo cáo bạn đã gửi cho phiên bản này' });
  await expect(mine).toContainText('Đang chờ xử lý');
  await report(page, 'File lỗi, thiếu trang hoặc chữ mờ', 'Gửi lại cùng loại.');
  await expect(page.getByRole('alert').filter({ hasText: 'cùng loại' })).toBeVisible();
  await page.getByRole('button', { name: 'Hủy báo cáo', exact: true }).click();
  await report(page, 'Nghi vấn quyền sử dụng', 'Có thể chưa được tác giả cho phép.');
  await expect(mine.getByRole('listitem')).toHaveCount(2);
  // A report never hides the document by itself.
  expect((await page.request.get(`/api/v1/library/versions/${versionId}`)).status()).toBe(200);
  await readerLogout(page);

  await readerLogin(page, 'admin', 'reports');
  await openReport(page, title, 'Đang chờ xử lý');
  await page.getByLabel('Kết quả gửi người báo cáo').fill('Trang 2 hiển thị đúng ở bản gốc.');
  await page.getByRole('button', { name: 'Không cần xử lý', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Lịch sử xử lý' })).toContainText(
    'Trang 2 hiển thị đúng ở bản gốc.',
  );
  await page.getByRole('button', { name: 'Đóng báo cáo', exact: true }).click();
  await readerLogout(page);

  await readerLogin(page, 'student', 'reports');
  await page.goto(route);
  await expect(mine).toContainText('Không cần xử lý');
  await expect(mine).toContainText('Phản hồi: Trang 2 hiển thị đúng ở bản gốc.');
  await readerLogout(page);

  await readerLogin(page, 'admin', 'reports');
  await openReport(page, title, 'Đang chờ xử lý');
  await page.getByRole('button', { name: 'Nhận xem xét', exact: true }).click();
  await expect(page.locator('.confirmation-identity')).toContainText('Đang xem xét');
  await page.getByLabel('Kết quả gửi người báo cáo').fill('Đã tạm ẩn để kiểm tra quyền.');
  await page.getByText('Ẩn toàn bộ tài liệu khi đánh dấu đã xử lý').click();
  await page.getByRole('button', { name: 'Đã xử lý và ẩn tài liệu', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'lý do ẩn' })).toBeVisible();
  await page.getByLabel('Lý do ẩn tài liệu').fill('Báo cáo quyền sử dụng');
  await page.getByRole('button', { name: 'Đã xử lý và ẩn tài liệu', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Lịch sử xử lý' })).toContainText(
    'Đã ẩn tài liệu: Báo cáo quyền sử dụng',
  );
  await expect(page.getByText('Tài liệu đang bị ẩn.', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await readerLogout(page);

  await readerLogin(page, 'student', 'reports');
  expect((await page.request.get(`/api/v1/library/versions/${versionId}`)).status()).toBe(404);
  const reports = await (
    await page.request.get(`/api/v1/library/versions/${versionId}/reports/mine`)
  ).json();
  expect(reports.items[0]).toMatchObject({
    status: 'RESOLVED',
    result: 'Đã tạm ẩn để kiểm tra quyền.',
  });
});
