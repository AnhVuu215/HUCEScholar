import { expect, test, type Page } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { openReaderFixture } from './helpers/reader-session';

const paper = (page: Page) => page.locator('.reader-page');
const pinNamed = (page: Page, text: string) =>
  page.getByRole('button', { name: new RegExp(`^Ghi chú trên trang: ${text}`) });
async function offset(page: Page, text: string) {
  const sheet = (await paper(page).boundingBox())!;
  const pin = (await pinNamed(page, text).boundingBox())!;
  return { x: pin.x - sheet.x, y: pin.y - sheet.y, width: sheet.width };
}

test('a page note is pinned on the PDF, survives reload, moves by dragging and can be unpinned', async ({
  page,
}) => {
  test.setTimeout(90_000);
  // Unique text keeps a retry from matching what an earlier attempt left behind.
  const text = `Xem lại hình ${randomUUID().slice(0, 6)}`;
  const fixture = await openReaderFixture(page, 'pins');
  await page.getByRole('button', { name: 'Ghim ghi chú lên trang', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Bấm vào chỗ cần ghim trên trang PDF' }),
  ).toBeVisible();
  await paper(page).click({ position: { x: 80, y: 120 } });
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã chọn vị trí trên trang 1' }),
  ).toBeVisible();
  const input = page.getByLabel('Nội dung ghi chú', { exact: true });
  await expect(input).toBeFocused();
  await input.fill(text);
  // The draft shows on the page before it is saved.
  await expect(page.locator('.pdf-note-pin.is-draft')).toHaveText(text);
  await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu ghi chú · Trang 1' }),
  ).toBeVisible();
  await expect(pinNamed(page, text)).toBeVisible();
  const placed = await offset(page, text);
  expect(Math.abs(placed.x - 80)).toBeLessThan(3);
  expect(Math.abs(placed.y - 120)).toBeLessThan(3);
  await expect(
    page.getByRole('article', { name: /^Ghi chú / }).filter({ hasText: text }),
  ).toContainText('Ghim trên trang');

  // Stored on the page, not in the browser: it is back in the same place after a reload.
  await page.reload();
  await expect(pinNamed(page, text)).toBeVisible({ timeout: 15000 });
  const reloaded = await offset(page, text);
  expect(Math.abs(reloaded.x - placed.x)).toBeLessThan(2);
  expect(Math.abs(reloaded.y - placed.y)).toBeLessThan(2);

  // Dragging saves the new place.
  await pinNamed(page, text).scrollIntoViewIfNeeded();
  const box = (await pinNamed(page, text).boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 110, { steps: 10 });
  await page.mouse.up();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã chuyển ghi chú · Trang 1' }),
  ).toBeVisible();
  await page.reload();
  await expect(pinNamed(page, text)).toBeVisible({ timeout: 15000 });
  const moved = await offset(page, text);
  expect(Math.abs(moved.x - (placed.x + 60))).toBeLessThan(3);
  expect(Math.abs(moved.y - (placed.y + 100))).toBeLessThan(3);

  // The pin can be hidden, and the page has no sideways scroll at phone width.
  await page.getByLabel('Hiện giấy nhớ trên trang', { exact: true }).uncheck();
  await expect(pinNamed(page, text)).toHaveCount(0);
  await page.getByLabel('Hiện giấy nhớ trên trang', { exact: true }).check();
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(pinNamed(page, text)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Clicking opens it for editing; "Bỏ ghim" keeps the note but takes it off the page.
  await pinNamed(page, text).click();
  await expect(input).toHaveValue(text);
  await page.getByRole('button', { name: 'Bỏ ghim', exact: true }).click();
  await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu ghi chú · Trang 1' }),
  ).toBeVisible();
  await expect(pinNamed(page, text)).toHaveCount(0);
  const entry = page.getByRole('article', { name: /^Ghi chú / }).filter({ hasText: text });
  await expect(entry).toHaveCount(1);
  await expect(entry).not.toContainText('Ghim trên trang');
  expect(fixture.versionId).toBeTruthy();
});
