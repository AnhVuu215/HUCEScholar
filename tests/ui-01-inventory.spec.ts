import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('e2e-ui-inventory-student@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL('/workspace/student');
}

test.describe('UI-01 control inventory — geometry checks', () => {
  test('workspace actions keep the 44px control token', async ({ page }) => {
    await login(page);
    const account = page.getByRole('button', { name: 'Menu tài khoản', exact: true });
    await expect(account).toBeVisible();
    expect((await account.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.goto('/workspace/library');
    const submit = page.getByRole('button', { name: 'Tìm kiếm', exact: true });
    await expect(submit).toBeVisible();
    expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test.describe('200% zoom emulation', () => {
    test.use({ viewport: { width: 720, height: 900 }, deviceScaleFactor: 2 });
    test('header stays visible without horizontal overflow', async ({ page }) => {
      await login(page);
      const header = page.locator('.workspace-header');
      await expect(header).toBeVisible();
      const box = (await header.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(720 + 1);
      await expect(
        page.getByRole('button', { name: 'Menu tài khoản', exact: true }),
      ).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  });
});
