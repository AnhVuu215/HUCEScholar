import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import {
  openReaderFixture,
  readerHeaders,
  readerLogin,
  readerLogout,
  selectReaderText,
} from './helpers/reader-session';

const palette = [
  ['#FFF59D', 'Vàng'],
  ['#A5D6A7', 'Xanh lá'],
  ['#90CAF9', 'Xanh dương'],
  ['#F8BBD0', 'Hồng'],
  ['#CE93D8', 'Tím'],
  ['#FFCC80', 'Cam'],
  ['#80CBC4', 'Xanh ngọc'],
  ['#B0BEC5', 'Xám'],
] as const;

test('choosing the unchanged zoom leaves the rendered page available', async ({ page }) => {
  await openReaderFixture(page);
  await page.getByRole('combobox', { name: 'Mức phóng', exact: true }).click();
  await page.getByRole('option', { name: 'Vừa chiều rộng', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
  ).toBeVisible();
});

test('eight named colors create, edit and survive a new login without changing anchors', async ({
  page,
}) => {
  test.setTimeout(120000);
  const { path, route } = await openReaderFixture(page);
  for (const [index, [color, name]] of palette.entries()) {
    await selectReaderText(page);
    await page.getByRole('button', { name: 'Tô sáng đoạn chọn', exact: true }).click();
    const colors = page.getByRole('group', { name: 'Màu tô sáng', exact: true });
    await expect(colors.getByRole('radio')).toHaveCount(8);
    await colors.getByRole('radio', { name, exact: true }).check();
    await expect(colors.getByRole('radio', { name, exact: true })).toBeChecked();
    await page.getByLabel('Ghi chú cho đoạn tô', { exact: true }).fill(`Ghi chú màu ${index}`);
    const save = page.waitForResponse(
      (r) => r.url().endsWith('/highlights') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Lưu vùng tô', exact: true }).click();
    const result = await save;
    expect(result.status()).toBe(201);
    const item = (await result.json()).item;
    expect(item).toMatchObject({ color, pageNumber: 1, content: `Ghi chú màu ${index}` });
    const article = page.getByRole('article', { name: `Vùng tô ${item.id}`, exact: true });
    await article.getByRole('button', { name: 'Sửa vùng tô', exact: true }).click();
    const [updatedColor, updatedName] = palette[(index + 1) % palette.length];
    await colors.getByRole('radio', { name: updatedName, exact: true }).check();
    const update = page.waitForResponse(
      (r) => r.url().endsWith(`/highlights/${item.id}`) && r.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Lưu vùng tô', exact: true }).click();
    const saved = await update;
    expect(saved.status()).toBe(200);
    expect((await saved.json()).item).toMatchObject({
      color: updatedColor,
      anchor: item.anchor,
      revision: 2,
    });
    await expect(page.getByLabel('Ghi chú cho đoạn tô', { exact: true })).toHaveCount(0);
  }
  await readerLogout(page);
  await readerLogin(page, 'student');
  await page.goto(route);
  await page.getByRole('tab', { name: 'Đoạn tô', exact: true }).click();
  await expect(page.getByRole('article', { name: /^Vùng tô / })).toHaveCount(8);
  const items = (await (await page.request.get(`${path}/highlights?pageNumber=1`)).json()).items;
  expect(items).toHaveLength(8);
  for (const [index] of palette.entries())
    expect(
      items.find((item: { content: string }) => item.content === `Ghi chú màu ${index}`)?.color,
    ).toBe(palette[(index + 1) % palette.length][0]);
  await page
    .getByRole('article', { name: /^Vùng tô / })
    .first()
    .getByRole('button', { name: 'Sửa vùng tô', exact: true })
    .click();
  const radios = page.getByRole('group', { name: 'Màu tô sáng', exact: true }).getByRole('radio');
  // Native radios expose keyboard selection without a pointer or color-only labels.
  await radios.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(radios.nth(1)).toBeChecked();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const group = page.getByRole('group', { name: 'Màu tô sáng', exact: true });
    await group.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const label of await group.locator('label').all())
      expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (process.env.CAPTURE_READER_V2 === '1') {
      mkdirSync('.impeccable/review/reader-v2', { recursive: true });
      await page.screenshot({ path: `.impeccable/review/reader-v2/palette-${width}.png` });
    }
  }
  await page.getByRole('button', { name: 'Hủy vùng tô', exact: true }).click();
});

test('a future saved color remains visible and requires an explicit choice before editing', async ({
  page,
}) => {
  const { path } = await openReaderFixture(page);
  await page.getByRole('tab', { name: 'Đoạn tô', exact: true }).click();
  const created = await page.request.post(`${path}/highlights`, {
    headers: await readerHeaders(page),
    data: {
      pageNumber: 1,
      content: 'Giữ nội dung cũ',
      color: '#FFF59D',
      requestId: crypto.randomUUID(),
      anchor: {
        coordinateSpace: 'normalized-pdf-v1',
        quote: 'HUCEScholar reader fixture',
        quads: [[0.1, 0.8, 0.6, 0.8, 0.6, 0.75, 0.1, 0.75]],
      },
    },
  });
  expect(created.status()).toBe(201);
  const item = (await created.json()).item;
  await page.route('**/highlights?pageNumber=1', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.items = body.items.map((entry: { id: string }) =>
      entry.id === item.id ? { ...entry, color: '#123abc' } : entry,
    );
    await route.fulfill({ response, json: body });
  });
  await page.getByRole('button', { name: 'Tải lại vùng tô', exact: true }).click();
  const article = page.getByRole('article', { name: `Vùng tô ${item.id}`, exact: true });
  await expect(article).toContainText('Màu đã lưu (#123ABC)');
  await article.getByRole('button', { name: 'Sửa vùng tô', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Chọn một màu trong bảng' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu vùng tô', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Ghi chú cho đoạn tô', { exact: true })).toHaveValue(
    'Giữ nội dung cũ',
  );
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Vàng', exact: true }).check();
  await page.unroute('**/highlights?pageNumber=1');
  await page.getByRole('button', { name: 'Lưu vùng tô', exact: true }).click();
  await expect(page.getByLabel('Ghi chú cho đoạn tô', { exact: true })).toHaveCount(0);
  expect(
    (await (await page.request.get(`${path}/highlights?pageNumber=1`)).json()).items[0],
  ).toMatchObject({ color: '#FFF59D', content: 'Giữ nội dung cũ', revision: 2 });
});
