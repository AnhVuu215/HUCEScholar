import { expect, test, type Page } from './helpers/test';
import { openReaderFixture, readerLogin } from './helpers/reader-session';

const list = (total: number) => JSON.stringify({ items: [], total, page: 1, limit: 12 });
const status = (page: Page) =>
  page
    .getByRole('region', { name: /Tài liệu đã lưu|Phiên bản đã đọc gần đây/ })
    .getByRole('status');

test('cancelling inline confirmations returns focus to the control that opened them', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openReaderFixture(page, 'ux');
  const save = page.getByRole('button', { name: 'Lưu tài liệu', exact: true });
  await save.click();
  const unsave = page.getByRole('button', { name: 'Bỏ lưu tài liệu', exact: true });
  await expect(unsave).toBeEnabled();
  await unsave.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Giữ tài liệu', exact: true }).click();
  await expect(unsave).toBeFocused();

  await page.getByLabel('Nội dung ghi chú', { exact: true }).fill('Ghi chú để thử hủy xóa');
  await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
  const remove = page.getByRole('button', { name: 'Xóa', exact: true });
  await expect(remove).toBeEnabled();
  await remove.click();
  await page.getByRole('button', { name: 'Giữ lại', exact: true }).click();
  await expect(remove).toBeFocused();
});

test('an emptied last page falls back to the previous page instead of getting stuck', async ({
  page,
}) => {
  await readerLogin(page, 'student', 'ux');
  await page.route('**/api/v1/personal-library/saved?*', (route) => {
    const second = new URL(route.request().url()).searchParams.get('page') === '2';
    // Page 2 was emptied elsewhere (e.g. the last item unsaved in another tab).
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: list(second ? 12 : 13),
    });
  });
  await page.goto('/workspace/personal-library');
  await expect(status(page)).toHaveText('13 mục · Trang 1/2');
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(status(page)).toHaveText('13 mục · Trang 1/2');
  await expect(status(page)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Trang trước', exact: true })).toBeDisabled();
});

test('a late response from the previous tab never replaces the selected list', async ({ page }) => {
  await readerLogin(page, 'student', 'ux');
  let releaseSaved!: () => void;
  const savedHeld = new Promise<void>((resolve) => {
    releaseSaved = resolve;
  });
  await page.route('**/api/v1/personal-library/saved?*', async (route) => {
    await savedHeld;
    await route
      .fulfill({ status: 200, contentType: 'application/json', body: list(5) })
      .catch(() => undefined);
  });
  await page.route('**/api/v1/personal-library/recent?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: list(0) }),
  );
  await page.goto('/workspace/personal-library');
  await page.getByRole('button', { name: 'Đọc gần đây', exact: true }).click();
  await expect(status(page)).toHaveText('0 mục · Trang 1/1');
  releaseSaved();
  await page.waitForTimeout(500);
  await expect(status(page)).toHaveText('0 mục · Trang 1/1');
  await expect(page.getByText('Chưa có tiến độ đọc đã lưu.', { exact: false })).toBeVisible();
});

test('home, personal library and settings do not scroll sideways at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await readerLogin(page, 'student', 'ux');
  for (const [path, heading] of [
    ['/workspace/student', 'Học tiếp'],
    ['/workspace/personal-library', 'Tài liệu đã lưu'],
    ['/workspace/settings', 'Bảo mật tài khoản'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      path,
    ).toBe(true);
  }
});
