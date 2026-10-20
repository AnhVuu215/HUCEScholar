import { test, expect } from '@playwright/test';

test.describe('UI-01 control inventory — geometry checks', () => {
  test('primary and form controls have expected heights', async ({ page }) => {
    await page.goto('/workspace/student');
    const primary = await page.locator('.primary-button').first();
    const primaryBox = await primary.boundingBox();
    expect(primaryBox).not.toBeNull();
    // allow small rendering differences; control height token = 44px
    expect(Math.round(primaryBox!.height)).toBeGreaterThanOrEqual(42);
    expect(Math.round(primaryBox!.height)).toBeLessThanOrEqual(52);
  });

  test('zoom 200% does not break header layout', async ({ page }) => {
    await page.goto('/workspace/student');
    // apply zoom; some browsers may not support document.body.style.zoom in headless — Playwright supports evaluate
    await page.evaluate(() => {
      document.body.style.zoom = '2';
    });
    const header = page.locator('.workspace-header');
    await expect(header).toBeVisible();
    const box = await header.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
  });
});
