import { expect, test } from '@playwright/test';
import { readerLogin } from './helpers/reader-session';
test('settings exposes only functional reader preferences', async ({ page }) => {
  await readerLogin(page, 'student', 'preferences');
  await page.goto('/workspace/settings');
  await expect(
    page.getByRole('heading', { name: 'Tùy chọn trình đọc', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Mức phóng mặc định', exact: true }),
  ).toBeVisible();
});
