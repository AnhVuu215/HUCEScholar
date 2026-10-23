import { expect, test } from './helpers/test';
import { openReaderFixture, readerLogin } from './helpers/reader-session';

// Findings #6–#9 of the 23/10 dev audit (docs/superpowers/plans/2026-10-23-dev-audit-fixes.md).

test('the role home breadcrumb says "Trang đầu", not the account page', async ({ page }) => {
  await readerLogin(page, 'student', 'upload3');
  await page.goto('/workspace/student');
  const crumb = page.locator('.workspace-breadcrumb');
  await expect(crumb).toContainText('Trang đầu');
  await expect(crumb).not.toContainText('Tài khoản của tôi');
});

test('account actions sit on one aligned row and wrap without overflow', async ({ page }) => {
  await readerLogin(page, 'admin', 'upload3');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/workspace/admin/users');
  const row = page
    .locator('.users-table tbody tr')
    .filter({ has: page.locator('.user-row-buttons') })
    .first();
  await expect(row).toBeVisible();
  const boxes = await row
    .locator('.user-row-buttons .text-button')
    .evaluateAll((buttons) =>
      buttons
        .map((b) => b.getBoundingClientRect())
        .map((r) => ({ top: Math.round(r.top), left: r.left })),
    );
  expect(boxes).toHaveLength(3);
  expect(new Set(boxes.map((b) => b.top)).size).toBe(1);
  expect(boxes[0].left).toBeLessThan(boxes[1].left);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test('"Xóa tìm kiếm" appears only when there is a search to clear', async ({ page }) => {
  await readerLogin(page, 'student', 'upload3');
  await page.goto('/workspace/student/materials');
  const clear = page.getByRole('button', { name: 'Xóa tìm kiếm', exact: true });
  await expect(page.getByRole('button', { name: 'Tìm kiếm', exact: true })).toBeVisible();
  await expect(clear).toHaveCount(0);
  await page.getByLabel('Tìm bản nháp', { exact: true }).fill('không có tài liệu này');
  await expect(clear).toBeVisible();
  await clear.click();
  await expect(page.getByLabel('Tìm bản nháp', { exact: true })).toHaveValue('');
  await expect(clear).toHaveCount(0);
});

test('the reader renders without duplicate React keys', async ({ page }) => {
  test.setTimeout(90_000);
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (/same key/i.test(message.text())) warnings.push(message.text());
  });
  await openReaderFixture(page, 'upload3');
  await page.reload();
  await expect(page.getByRole('img', { name: /^Trang PDF/ }).first()).toBeVisible();
  expect(warnings).toEqual([]);
});
