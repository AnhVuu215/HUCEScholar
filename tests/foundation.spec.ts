import { expect, test } from '@playwright/test';

test('web reaches the real API through its own origin', async ({ page, request }) => {
  const response = await request.get('/api/v1/health');
  expect(response.ok()).toBe(true);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(await response.json()).toEqual({ status: 'ok', service: 'hucescholar-api' });

  await page.goto('/project');
  await expect(page.getByRole('heading', { name: 'HUCEScholar', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('API đang hoạt động');
  await expect(
    page.getByText(
      'Đã có tài khoản, danh mục, phân công, PDF riêng tư, kiểm duyệt, kho học liệu và trình đọc theo quyền. Ghi chú riêng chưa được mở.',
    ),
  ).toBeVisible();
});

test('API network failure has an accessible retry that recovers', async ({ page }) => {
  await page.route('**/api/v1/health', (route) => route.abort('failed'));
  await page.goto('/project');
  await expect(page.getByRole('status')).toContainText('Chưa kết nối được API');
  await page.screenshot({ path: '.local/foundation-error.png', fullPage: true });
  const retry = page.getByRole('button', { name: 'Thử lại' });
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.unroute('**/api/v1/health');
  await retry.press('Enter');
  await expect(page.getByRole('status')).toContainText('API đang hoạt động');
});

test('an unexpected 200 response is not treated as healthy', async ({ page }) => {
  await page.route('**/api/v1/health', (route) =>
    route.fulfill({ json: { status: 'ok', service: 'another-service' } }),
  );
  await page.goto('/project');
  await expect(page.getByRole('status')).toContainText('Chưa kết nối được API');
});

test('shows loading while the API is still pending', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/health', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/project');
  await expect(page.getByRole('status')).toContainText('Đang kiểm tra API');
  release();
  await expect(page.getByRole('status')).toContainText('API đang hoạt động');
});

for (const [name, width, height] of [
  ['mobile', 360, 800],
  ['tablet', 768, 1024],
  ['desktop', 1440, 1000],
] as const) {
  test(`${name}: reflows without horizontal page overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/project');
    await expect(page.getByRole('status')).toContainText('API đang hoạt động');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.getByRole('link', { name: 'Phạm vi hiện tại' })).toBeVisible();
    await page.getByRole('link', { name: 'Phạm vi hiện tại' }).click();
    await expect(page).toHaveURL(/#pham-vi$/);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.local/foundation-${name}.png`, fullPage: true });
  });
}
