import { expect, test, type Page } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import {
  openReaderFixture,
  readerHeaders,
  readerLogin,
  selectReaderText,
} from './helpers/reader-session';

let fixture: Awaited<ReturnType<typeof openReaderFixture>>;
let scan: Awaited<ReturnType<typeof openReaderFixture>>;
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    fixture = await openReaderFixture(page, 'reader-direct', { longText: true });
    scan = await openReaderFixture(page, 'reader-scan', { scan: true });
  } finally {
    await page.close();
  }
});
test.beforeEach(async ({ page }) => {
  await readerLogin(page, 'student', 'reader-direct');
  await page.goto(fixture.route);
  await expect(page.getByRole('status').filter({ hasText: 'Đã hiển thị trang' })).toBeVisible();
  if ((await page.getByRole('spinbutton', { name: 'Số trang', exact: true }).inputValue()) !== '1')
    await page.getByRole('button', { name: 'Trang trước', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => {
  const headers = await readerHeaders(page);
  for (const path of [fixture.path, scan.path])
    for (const pageNumber of [1, 2])
      for (const kind of ['highlights', 'notes']) {
        const response = await page.request.get(`${path}/${kind}?pageNumber=${pageNumber}`);
        if (response.status() !== 200) continue;
        const body = await response.json();
        for (const item of body.items)
          expect(
            (
              await page.request.delete(`${path}/${kind}/${item.id}`, {
                headers,
                data: { revision: item.revision },
              })
            ).status(),
          ).toBe(204);
      }
});
const floating = (page: Page) =>
  page.getByRole('toolbar', { name: 'Thao tác đoạn chọn', exact: true });
async function noteSelection(page: Page) {
  await selectReaderText(page);
  await floating(page).getByRole('button', { name: 'Ghi chú đoạn chọn', exact: true }).click();
}

test('selection toolbar stays in the viewport and draft keeps its original page after zoom and navigation', async ({
  page,
}) => {
  test.setTimeout(60000);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    await expect
      .poll(() =>
        page.locator('.reader-stage').evaluate((stage) => {
          const canvas = stage.querySelector('canvas');
          return (
            !!canvas &&
            Math.abs(canvas.getBoundingClientRect().width - Math.max(160, stage.clientWidth - 64)) <
              3
          );
        }),
      )
      .toBe(true);
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
    ).toBeVisible();
    await selectReaderText(page);
    await expect(floating(page)).toBeVisible();
    const bounds = (await floating(page).boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(850);
  }
  await floating(page).getByRole('button', { name: 'Ghi chú đoạn chọn', exact: true }).click();
  const editor = page.getByLabel('Ghi chú cho đoạn tô', { exact: true });
  await editor.fill('Giữ nguyên trang và đoạn gốc');
  const panel = page.getByRole('region', { name: 'Ghi chú tài liệu', exact: true });
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 950 });
    await panel.scrollIntoViewIfNeeded();
    const stage = (await page.locator('.reader-stage').boundingBox())!;
    const box = (await panel.boundingBox())!;
    if (width === 1440) expect(box.x).toBeGreaterThanOrEqual(stage.x + stage.width);
    else expect(box.y).toBeGreaterThanOrEqual(stage.y + stage.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (process.env.CAPTURE_READER_DIRECT === '1') {
      mkdirSync('.impeccable/review/reader-direct', { recursive: true });
      await page.screenshot({ path: `.impeccable/review/reader-direct/panel-${width}.png` });
    }
  }
  await page.getByRole('button', { name: 'Xoay trang', exact: true }).click();
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Vùng tô đang soạn · Trang 1', exact: true }),
  ).toBeVisible();
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/highlights') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Lưu vùng tô', exact: true }).click();
  const result = (await (await saved).json()).item;
  expect(result).toMatchObject({
    versionId: fixture.versionId,
    pageNumber: 1,
    content: 'Giữ nguyên trang và đoạn gốc',
  });
  expect(result.anchor.quote).toContain('HUCEScholar reader fixture');
});

test('switching editor asks once, cancel preserves the draft and busy or uncertain saves block switching', async ({
  page,
}) => {
  await noteSelection(page);
  const editor = page.getByLabel('Ghi chú cho đoạn tô', { exact: true });
  await editor.fill('Bản soạn cần giữ');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('tab', { name: 'Ghi chú trang', exact: true }).click();
  await expect(editor).toHaveValue('Bản soạn cần giữ');
  await expect(page.getByRole('tab', { name: 'Đoạn tô', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('tab', { name: 'Ghi chú trang', exact: true }).click();
  await expect(editor).toBeHidden();
  await page.getByLabel('Nội dung ghi chú', { exact: true }).fill('Bản soạn ghi chú trang');
  await selectReaderText(page);
  page.once('dialog', (dialog) => dialog.accept());
  await floating(page).getByRole('button', { name: 'Ghi chú đoạn chọn', exact: true }).click();
  await editor.fill('Lần lưu chưa xác nhận');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/highlights', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fetch();
    await gate;
    await route.abort();
  });
  await page.getByRole('button', { name: 'Lưu vùng tô', exact: true }).click();
  await expect(editor).toHaveAttribute('readonly', '');
  await page.getByRole('tab', { name: 'Ghi chú trang', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Đoạn tô', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  release();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Chưa xác nhận được lần lưu' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Ghi chú trang', exact: true }).click();
  await expect(editor).toHaveValue('Lần lưu chưa xác nhận');
  await page.unroute('**/highlights');
  await page.getByRole('button', { name: 'Lưu vùng tô', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(
    (await (await page.request.get(`${fixture.path}/highlights?pageNumber=1`)).json()).items,
  ).toHaveLength(1);
});

test('overlapping saved highlights require an explicit choice', async ({ page }) => {
  await noteSelection(page);
  await page.getByLabel('Ghi chú cho đoạn tô', { exact: true }).fill('Vùng thứ nhất');
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/highlights') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Lưu vùng tô', exact: true }).click();
  const item = (await (await saved).json()).item;
  const other = await page.request.post(`${fixture.path}/highlights`, {
    headers: await readerHeaders(page),
    data: {
      pageNumber: 1,
      content: 'Vùng thứ hai',
      color: '#CE93D8',
      anchor: item.anchor,
      requestId: randomUUID(),
    },
  });
  expect(other.status()).toBe(201);
  const id = (await other.json()).item.id;
  await page.getByRole('button', { name: 'Tải lại vùng tô', exact: true }).click();
  const overlay = page.locator(`[data-highlight-id="${id}"]`).first();
  await overlay.scrollIntoViewIfNeeded();
  const box = (await overlay.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const choices = page.getByRole('group', { name: 'Vùng tô chồng nhau', exact: true });
  await expect(choices.getByRole('button')).toHaveCount(2);
  await expect(page.getByLabel('Ghi chú cho đoạn tô', { exact: true })).toHaveCount(0);
  await choices.getByRole('button', { name: 'Tím · Vùng thứ hai', exact: true }).click();
  await expect(page.getByLabel('Ghi chú cho đoạn tô', { exact: true })).toHaveValue('Vùng thứ hai');
});

test('keyboard activation retains the selection and oversized selection reports why', async ({
  page,
}) => {
  const hide = page.getByRole('button', { name: 'Ẩn ghi chú', exact: true });
  await hide.focus();
  await hide.press('Enter');
  const reopen = page.getByRole('button', { name: 'Hiện ghi chú', exact: true });
  await expect(reopen).toBeFocused();
  await reopen.press('Enter');
  await expect(page.getByRole('tab', { name: 'Ghi chú trang', exact: true })).toBeFocused();
  await page
    .locator('.textLayer span')
    .filter({ hasText: 'HUCEScholar reader fixture' })
    .first()
    .scrollIntoViewIfNeeded();
  await page
    .locator('.textLayer span')
    .filter({ hasText: 'HUCEScholar reader fixture' })
    .first()
    .evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
  const action = floating(page).getByRole('button', { name: 'Ghi chú đoạn chọn', exact: true });
  await action.focus();
  await action.press('Enter');
  await expect(page.locator('.note-editor blockquote')).toContainText('HUCEScholar reader fixture');
  await page.getByRole('button', { name: 'Hủy vùng tô', exact: true }).click();
  const longSpans = page.locator('.textLayer span').filter({ hasText: /^A+$/ });
  await longSpans.first().scrollIntoViewIfNeeded();
  await page
    .locator('.textLayer span')
    .filter({ hasText: /^A+$/ })
    .first()
    .evaluate((node) => {
      const range = document.createRange();
      const spans = Array.from(node.parentElement!.querySelectorAll('span')).filter((span) =>
        /^A+$/.test(span.textContent ?? ''),
      );
      range.setStart(spans[0].firstChild!, 0);
      const last = spans.at(-1)!.firstChild!;
      range.setEnd(last, last.textContent!.length);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
  await expect(page.getByRole('status').filter({ hasText: 'vượt quá 2000 ký tự' })).toBeVisible();
  await expect(floating(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tô sáng đoạn chọn', exact: true })).toBeDisabled();
  await page
    .locator('.textLayer span')
    .filter({ hasText: 'HUCEScholar reader fixture' })
    .first()
    .evaluate((node) => {
      const end = document.querySelector('.annotation-panel-heading h3')!.firstChild!;
      const range = document.createRange();
      range.setStart(node.firstChild!, 0);
      range.setEnd(end, end.textContent!.length);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
  await expect(
    page.getByRole('status').filter({ hasText: 'Chỉ chọn văn bản trong một trang PDF' }),
  ).toBeVisible();
});

test('scan PDF supports page notes without offering text selection actions', async ({ page }) => {
  await page.goto(scan.route);
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
  ).toBeVisible();
  await expect(page.locator('.textLayer span')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tô sáng đoạn chọn', exact: true })).toBeDisabled();
  await page.getByLabel('Nội dung ghi chú', { exact: true }).fill('Ghi chú cho tài liệu scan');
  await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu ghi chú · Trang 1' }),
  ).toBeVisible();
});
