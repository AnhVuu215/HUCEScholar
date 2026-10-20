import { expect, test } from './helpers/test';
import { openReaderFixture, readerLogin } from './helpers/reader-session';

const empty = (limit: number) => JSON.stringify({ items: [], total: 0, page: 1, limit });

test('student home continues the latest version at its saved page', async ({ page }) => {
  test.setTimeout(90_000);
  const { versionId, route } = await openReaderFixture(page, 'home');
  await expect
    .poll(async () => {
      const recent = await (await page.request.get('/api/v1/personal-library/recent')).json();
      return recent.items[0]?.versionId;
    })
    .toBe(versionId);
  await page.goto('/workspace/student');
  const card = page.getByRole('article', { name: 'Tài liệu đọc gần nhất', exact: true });
  await expect(card.getByRole('heading', { level: 3 })).toContainText('Tài liệu kiểm thử');
  await expect(card).toContainText('Đã đọc đến trang 1');
  const materials = page.getByRole('region', { name: 'Tài liệu đóng góp của bạn' });
  await expect(
    materials.getByRole('heading', { name: /^Bản nháp đang soạn · \d+$/ }),
  ).toBeVisible();
  await expect(materials.getByRole('alert')).toHaveCount(0);
  await card.getByRole('link', { name: 'Đọc tiếp trang 1', exact: true }).click();
  await expect(page).toHaveURL(route);
});

test('empty and failed sections stay independent and retry in place', async ({ page }) => {
  await readerLogin(page, 'student', 'home');
  await page.route('**/api/v1/personal-library/recent?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: empty(12) }),
  );
  let failDrafts = true;
  await page.route('**/api/v1/material-drafts?*', (route) =>
    failDrafts ? route.abort('failed') : route.continue(),
  );
  await page.goto('/workspace/student');
  await expect(page.getByText('Bạn chưa đọc tài liệu nào.')).toBeVisible();
  const materials = page.getByRole('region', { name: 'Tài liệu đóng góp của bạn' });
  await expect(materials.getByRole('alert')).toHaveCount(2);
  failDrafts = false;
  await materials.getByRole('button', { name: 'Tải lại yêu cầu sửa', exact: true }).click();
  await expect(
    materials.getByRole('heading', { name: /^Cần sửa theo yêu cầu · \d+$/ }),
  ).toBeVisible();
  await expect(materials.getByRole('alert')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('admin home shows the moderation queue oldest first and recovers from failure', async ({
  page,
}) => {
  await readerLogin(page, 'admin', 'home');
  let fail = true;
  await page.route('**/api/v1/admin/publication-requests?*', (route) => {
    if (fail) return route.abort('failed');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: empty(5),
    });
  });
  await page.goto('/workspace/admin');
  const queue = page.getByRole('region', { name: 'Yêu cầu chờ duyệt' });
  await expect(queue.getByRole('alert')).toBeVisible();
  fail = false;
  await queue.getByRole('button', { name: 'Tải lại hàng chờ', exact: true }).click();
  await expect(queue.getByText('Không có yêu cầu chờ duyệt.', { exact: true })).toBeVisible();
  await expect(queue.getByRole('link', { name: 'Mở kiểm duyệt học liệu' })).toHaveAttribute(
    'href',
    '/workspace/admin/moderation',
  );
  await page.unroute('**/api/v1/admin/publication-requests?*');
  await page.reload();
  await expect(queue.getByRole('alert')).toHaveCount(0);
  await expect(queue.getByRole('status')).toHaveCount(0);
});
