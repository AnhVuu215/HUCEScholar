import { expect, test, type Page } from './helpers/test';
import { openReaderFixture } from './helpers/reader-session';

const shape = (page: Page) =>
  page
    .locator('.reader-page canvas')
    .first()
    .evaluate((canvas: HTMLCanvasElement) =>
      canvas.width > canvas.height ? 'landscape' : 'portrait',
    );

test('pages stored with /Rotate render upright and the reader rotation adds to it', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openReaderFixture(page, 'rotation', { rotated: true });
  expect(await shape(page)).toBe('portrait');
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' })).toBeVisible(
    { timeout: 15_000 },
  );
  // Page 2 is an A4 portrait MediaBox with /Rotate 90, so it must be shown landscape.
  expect(await shape(page)).toBe('landscape');
  await expect(page.locator('.textLayer span').filter({ hasText: 'Second page' })).toBeVisible();
  await page.getByRole('button', { name: 'Xoay trang', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' })).toBeVisible(
    { timeout: 15_000 },
  );
  expect(await shape(page)).toBe('portrait');
});
