import { expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
export async function captureCatalog(page: Page, name: string) {
  if (process.env.CAPTURE_CATALOG_UI !== '1') return;
  mkdirSync('.impeccable/review/catalog', { recursive: true });
  for (const [size, width, height] of [
    ['desktop', 1440, 1000],
    ['tablet', 768, 1024],
    ['mobile', 360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `.impeccable/review/catalog/${name}-${size}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}
