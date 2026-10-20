import { expect, test } from './helpers/test';
import { mkdirSync } from 'node:fs';

for (const [device, width, height] of [
  ['mobile', 360, 800],
  ['narrow', 320, 800],
  ['tablet', 768, 1024],
  ['desktop', 1440, 1000],
] as const) {
  test(`${device}: login and workspace keep the primary task reachable`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/login');
    const password = page.getByLabel('Mật khẩu', { exact: true });
    if (width <= 900) {
      const bounds = await password.boundingBox();
      expect(bounds!.y + bounds!.height).toBeLessThan(height);
    }
    if (process.env.CAPTURE_UI_REFINEMENTS === '1') {
      mkdirSync('.impeccable/review/web-ui', { recursive: true });
      await page.screenshot({
        path: `.impeccable/review/web-ui/login-${device}.png`,
        fullPage: true,
      });
    }
    await page.getByLabel('Email', { exact: true }).fill('e2e-admin@example.test');
    await password.fill(process.env.E2E_PASSWORD!);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Học tiếp', exact: true })).toBeVisible();
    const navigation = page.getByRole('navigation', { name: 'Điều hướng không gian' });
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    const sidebar = page.getByRole('complementary');
    const sidebarBounds = await sidebar.boundingBox();
    expect(sidebarBounds!.width).toBeCloseTo(width <= 900 ? width : 244, 0);
    expect(await sidebar.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
    if (width <= 900) {
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
      await expect(navigation).toBeHidden();
      await menu.focus();
      await page.keyboard.press('Enter');
      await expect(
        navigation.getByRole('link', { name: 'Quản lý tài khoản', exact: true }),
      ).toBeVisible();
      if (process.env.CAPTURE_UI_REFINEMENTS === '1') {
        await page.screenshot({
          path: `.impeccable/review/web-ui/menu-${device}.png`,
          fullPage: true,
        });
      }
      await page.keyboard.press('Tab');
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      await expect(navigation).toBeHidden();
      await menu.click();
      // Link may preventDefault even when it points to the current route.
      // A destination remount must not be what makes the menu close.
      await navigation.getByRole('link', { name: 'Kho học liệu', exact: true }).click();
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
      await expect(navigation).toBeHidden();
      // Wait for the destination workspace before reopening its menu for the same-route check.
      await expect(page.getByRole('heading', { name: 'Kho học liệu', exact: true })).toBeVisible();
      await menu.click();
    } else {
      await expect(menu).toBeHidden();
      await expect(navigation).toBeVisible();
    }
    await navigation.getByRole('link', { name: 'Kho học liệu', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Kho học liệu', exact: true })).toBeVisible();
    for (const filter of await page.locator('.library-filters select').all()) {
      expect((await filter.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await filter.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe(
        '1px',
      );
    }
    if (width <= 900) await expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (process.env.CAPTURE_UI_REFINEMENTS === '1') {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `.impeccable/review/web-ui/library-${device}.png`,
        fullPage: true,
      });
    }
    await page.goto('/project');
    expect((await page.getByRole('complementary').boundingBox())!.width).toBeCloseTo(
      width <= 900 ? width : 244,
      0,
    );
  });
}
