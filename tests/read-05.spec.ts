import { expect, test, type Page } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { openReaderFixture, readerHeaders } from './helpers/reader-session';

const shown = (page: Page, n: number) =>
  page.getByRole('status').filter({ hasText: `Đã hiển thị trang ${n} / 2` });
const stage = (page: Page) => page.locator('.reader-stage');

test('thumbnails jump to a page and continuous scroll follows the page being read', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const text = `Ghim trang hai ${randomUUID().slice(0, 6)}`;
  const fixture = await openReaderFixture(page, 'scroll');
  expect(
    (
      await page.request.post(`${fixture.path}/notes`, {
        headers: await readerHeaders(page),
        data: {
          pageNumber: 2,
          content: text,
          requestId: randomUUID(),
          position: { x: 0.2, y: 0.8 },
        },
      })
    ).status(),
  ).toBe(201);

  // "Các trang": one picture per page, the page being read marked, a click opens a page.
  await page.getByRole('button', { name: 'Các trang', exact: true }).click();
  const thumbnails = page.getByRole('list', { name: 'Các trang của tài liệu' });
  await expect(thumbnails.getByRole('button')).toHaveCount(2);
  await expect(thumbnails.getByRole('button', { name: 'Trang 1', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect
    .poll(() =>
      thumbnails
        .locator('canvas')
        .first()
        .evaluate((c: HTMLCanvasElement) => c.width),
    )
    .toBeGreaterThan(0);
  await thumbnails.getByRole('button', { name: 'Trang 2', exact: true }).click();
  await expect(shown(page, 2)).toBeVisible();
  await expect(page.getByLabel('Số trang', { exact: true })).toHaveValue('2');
  await expect(thumbnails.getByRole('button', { name: 'Trang 2', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('button', { name: 'Các trang', exact: true }).click();
  await page.getByRole('button', { name: 'Trang trước', exact: true }).click();
  await expect(shown(page, 1)).toBeVisible();

  // Continuous scroll: both pages in one column; scrolling down reads page 2.
  const toggle = page.getByRole('button', { name: 'Cuộn liền các trang', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.reader-slot')).toHaveCount(2);
  await expect(shown(page, 1)).toBeVisible();
  await expect(page.locator('.reader-slot[data-page="1"] .reader-page')).toHaveCount(1);
  await stage(page).evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(shown(page, 2)).toBeVisible();
  await expect(page.getByLabel('Số trang', { exact: true })).toHaveValue('2');
  await expect(page.locator('.reader-slot[data-page="2"] .reader-page')).toHaveCount(1);
  // Page 1 keeps its picture while page 2 carries the layers, including its sticky note.
  await expect(page.locator('.reader-slot[data-page="1"] .reader-slot-preview')).toHaveCount(1);
  await expect(page.locator('.reader-slot[data-page="1"] .reader-page')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: new RegExp(`^Ghi chú trên trang: ${text}`) }),
  ).toBeVisible();

  // The toolbar still moves pages, and scrolls the column to the page.
  await page.getByRole('button', { name: 'Trang trước', exact: true }).click();
  await expect(shown(page, 1)).toBeVisible();
  const offset = await page.locator('.reader-slot[data-page="1"]').evaluate((slot) => {
    const root = slot.closest('.reader-stage')!;
    return slot.getBoundingClientRect().top - root.getBoundingClientRect().top;
  });
  expect(Math.abs(offset - 16)).toBeLessThan(4);

  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.locator('.reader-slot')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });

  // The browser remembers the layout; switching back shows one page at a time.
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
  await expect(page.locator('.reader-slot')).toHaveCount(2);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.reader-slot')).toHaveCount(0);
  await expect(page.locator('.reader-page')).toHaveCount(1);
});
