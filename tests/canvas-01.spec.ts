import { expect, test, type Page } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { openReaderFixture, readerHeaders, readerLogin } from './helpers/reader-session';

/** A small solid-colour PNG, built here so the test needs no binary fixture. */
function png(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x3a)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

type Item = { type: string; font?: string; blocks?: unknown };
async function pageItems(page: Page, notebookId: string, pageId: string): Promise<Item[]> {
  const response = await page.request.get(`/api/v1/notebooks/${notebookId}/pages/${pageId}`);
  expect(response.status()).toBe(200);
  return (await response.json()).page.content.items as Item[];
}
const ids = (page: Page) => {
  const url = new URL(page.url());
  return { notebookId: url.pathname.split('/').pop()!, pageId: url.searchParams.get('page')! };
};
const saved = (page: Page) =>
  expect(page.locator('.note-save')).toHaveText('Đã lưu', { timeout: 15_000 });
async function draw(page: Page, from: [number, number], to: [number, number]) {
  const surface = await page.locator('svg.note-surface').boundingBox();
  if (!surface) throw new Error('No drawing surface.');
  const x = surface.x + surface.width * from[0],
    y = surface.y + surface.height * from[1];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step++)
    await page.mouse.move(
      x + ((to[0] - from[0]) * surface.width * step) / 12,
      y + ((to[1] - from[1]) * surface.height * step) / 12 + (step % 2) * 3,
    );
  await page.mouse.up();
}
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('a notebook keeps ink, Vietnamese text and images, pages reorder, conflicts ask and print exports every page', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await page.goto('/login');
  await readerLogin(page, 'student', 'canvas2');
  const title = `Vở Giải tích ${randomUUID().slice(0, 8)}`;

  await page.goto('/workspace/notes');
  // The shelf keeps the usual sidebar; only an open notebook folds it into the ☰ menu.
  await expect(page.getByRole('link', { name: 'Vở ghi', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ Vở mới' }).click();
  await page.getByLabel('Tên vở').fill(title);
  await page.getByRole('radio', { name: 'Vở ô li (4 ô)' }).check();
  await page.getByRole('button', { name: 'Tạo vở', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\/notes\/\d+\?page=\d+/);
  await expect(page.locator('.note-title-text')).toHaveText(title);
  const first = ids(page);

  // Ink, then undo and redo it.
  await page.locator('.note-tool[data-tool="pen"]').click();
  await draw(page, [0.2, 0.2], [0.6, 0.25]);
  await draw(page, [0.2, 0.3], [0.6, 0.35]);
  await saved(page);
  expect(
    (await pageItems(page, first.notebookId, first.pageId)).filter((i) => i.type === 'stroke'),
  ).toHaveLength(2);
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await saved(page);
  expect(
    (await pageItems(page, first.notebookId, first.pageId)).filter((i) => i.type === 'stroke'),
  ).toHaveLength(1);
  await page.getByRole('button', { name: 'Làm lại', exact: true }).click();
  await saved(page);
  expect(
    (await pageItems(page, first.notebookId, first.pageId)).filter((i) => i.type === 'stroke'),
  ).toHaveLength(2);

  // Typed Vietnamese in a handwriting font.
  const words = 'Định lý Lagrange: f(b) − f(a) = f′(c)(b − a) — ghi nhớ ư ơ ă đ';
  await page.locator('.note-tool[data-tool="text"]').click();
  const surface = (await page.locator('svg.note-surface').boundingBox())!;
  await page.mouse.click(surface.x + surface.width * 0.25, surface.y + surface.height * 0.5);
  const box = page.getByRole('textbox', { name: 'Nội dung hộp chữ' });
  await expect(box).toBeFocused();
  await page.getByLabel('Font chữ').selectOption('patrick-hand');
  await box.click();
  await page.keyboard.type(words);
  await page.getByRole('button', { name: 'Xong', exact: true }).click();

  // An image from the computer (the file picker path; drag-and-drop shares the same upload).
  await page.locator('input[type="file"][accept^="image/"]').setInputFiles({
    name: 'so-do.png',
    mimeType: 'image/png',
    buffer: png(64, 40),
  });
  await expect(page.getByRole('status').filter({ hasText: 'Đã thêm ảnh' })).toBeVisible({
    timeout: 15_000,
  });
  await saved(page);

  await page.reload();
  await expect(page.locator('.note-title-text')).toHaveText(title);
  await expect(page.locator('svg.note-surface')).toContainText('Định lý Lagrange');
  const items = await pageItems(page, first.notebookId, first.pageId);
  expect(items.filter((i) => i.type === 'stroke')).toHaveLength(2);
  expect(items.filter((i) => i.type === 'image')).toHaveLength(1);
  const text = items.find((i) => i.type === 'text');
  expect(text?.font).toBe('patrick-hand');
  expect(JSON.stringify(text?.blocks)).toContain('ghi nhớ ư ơ ă đ');
  const detail = await (await page.request.get(`/api/v1/notebooks/${first.notebookId}`)).json();
  expect(detail.pages[0].paper).toBe('O_LI');

  // A second page, moved in front of the first.
  const pages = page.getByRole('navigation', { name: 'Các trang trong vở' });
  await pages.getByRole('button', { name: '+ Trang mới', exact: true }).click();
  await expect(pages.getByRole('listitem')).toHaveCount(2);
  await expect(page.locator('.note-page-count')).toHaveText('Trang 2/2');
  const second = ids(page).pageId;
  await page.getByRole('button', { name: 'Chuyển trang 2 lên' }).click();
  await expect
    .poll(async () =>
      (await (await page.request.get(`/api/v1/notebooks/${first.notebookId}`)).json()).pages.map(
        (p: { id: string }) => p.id,
      ),
    )
    .toEqual([second, first.pageId]);

  // The same page edited in two tabs: the later save asks instead of overwriting.
  await page.goto(`/workspace/notes/${first.notebookId}?page=${first.pageId}`);
  const other = await context.newPage();
  await other.goto(`/workspace/notes/${first.notebookId}?page=${first.pageId}`);
  await other.locator('.note-tool[data-tool="pen"]').click();
  await draw(other, [0.3, 0.6], [0.7, 0.62]);
  await saved(other);
  await page.locator('.note-tool[data-tool="pen"]').click();
  await draw(page, [0.3, 0.7], [0.7, 0.72]);
  const conflict = page.getByRole('dialog', { name: 'Trang đã được sửa ở nơi khác' });
  await expect(conflict).toBeVisible({ timeout: 15_000 });
  await conflict.getByRole('button', { name: 'Tải bản mới nhất (bỏ thay đổi của tôi)' }).click();
  await saved(page);
  expect(
    (await pageItems(page, first.notebookId, first.pageId)).filter((i) => i.type === 'stroke'),
  ).toHaveLength(3);
  await other.close();

  // Print view: one sheet per page; Chromium's PDF of it has both pages.
  await page.goto(`/workspace/notes/${first.notebookId}/print`);
  await expect(page.getByRole('status').filter({ hasText: '2 trang sẵn sàng' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('.note-print-page')).toHaveCount(2);
  const pdf = (await page.pdf({ format: 'A4', printBackground: true })).toString('latin1');
  expect(pdf.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(2);

  // Narrow screens: shelf and editor stay inside the viewport.
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/workspace/notes');
  await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await page.goto(`/workspace/notes/${first.notebookId}`);
  await expect(page.locator('svg.note-surface')).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
});

test('a note from the Sổ tay becomes a quote card that opens the reader at its page', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const content = `Ý chính chương 2 ${randomUUID().slice(0, 8)}`;
  const fixture = await openReaderFixture(page, 'canvas1');
  const note = await page.request.post(`${fixture.path}/notes`, {
    headers: await readerHeaders(page),
    data: { pageNumber: 2, content, requestId: randomUUID() },
  });
  expect(note.status()).toBe(201);

  await page.goto('/workspace/notebook');
  const entry = page.getByRole('article').filter({ hasText: content });
  await entry.getByRole('button', { name: 'Ghi vào vở', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ghi vào vở' });
  await dialog.getByRole('radio', { name: /Vở mới/ }).check();
  await dialog.getByRole('button', { name: 'Ghi vào vở', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Đã thêm 1 thẻ trích dẫn');
  await dialog.getByRole('link', { name: 'Mở vở' }).click();

  const card = page.locator('svg.note-surface [data-note-quote]');
  await expect(card).toContainText(content);
  await page.locator('.note-tool[data-tool="select"]').click();
  await card.getByRole('link', { name: /· tr\. 2$/ }).click();
  await expect(page).toHaveURL(`${fixture.route}?page=2`);

  // Linked to the document's course, the notebook is offered when the Sổ tay is filtered by it.
  const course = (
    await (await page.request.get(`/api/v1/library/versions/${fixture.versionId}`)).json()
  ).item.courses[0] as { id: string; code: string; name: string };
  const notebookTitle = `Vở môn ${course.code}`;
  const created = await page.request.post('/api/v1/notebooks', {
    headers: await readerHeaders(page),
    data: {
      title: notebookTitle,
      cover: 'navy',
      courseId: course.id,
      defaultSize: 'A4_PORTRAIT',
      defaultPaper: 'GRID',
      defaultColor: 'white',
      requestId: randomUUID(),
    },
  });
  expect(created.status()).toBe(201);
  await page.goto('/workspace/notebook');
  const region = page.getByRole('region', { name: 'Ghi chú trên mọi tài liệu', exact: true });
  await region.getByRole('combobox', { name: 'Môn học', exact: true }).click();
  await page.getByRole('option', { name: `${course.code} · ${course.name}`, exact: true }).click();
  await region.getByRole('button', { name: 'Tìm ghi chú', exact: true }).click();
  await expect(page.locator('.course-notebooks')).toContainText('Vở ghi của môn này');
  await expect(
    page.locator('.course-notebooks').getByRole('link', { name: notebookTitle }),
  ).toHaveAttribute('href', `/workspace/notes/${(await created.json()).item.id}`);
});

test('a page with many strokes paints them as cached tiles, keeps the selection vector and prints vectors', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await readerLogin(page, 'student', 'canvas2');
  const headers = await readerHeaders(page);
  const created = await page.request.post('/api/v1/notebooks', {
    headers,
    data: {
      title: `Vở nhiều nét ${randomUUID().slice(0, 6)}`,
      cover: 'navy',
      courseId: null,
      defaultSize: 'A4_PORTRAIT',
      defaultPaper: 'GRID',
      defaultColor: 'white',
      requestId: randomUUID(),
    },
  });
  const detail = await created.json();
  const notebookId = detail.item.id as string,
    pageId = detail.pages[0].id as string;
  // 400 short strokes in rows (20 per row), a highlighter every fifth.
  const items = Array.from({ length: 400 }, (_, i) => {
    const x0 = 60 + (i % 20) * 34,
      y0 = 80 + Math.floor(i / 20) * 40;
    const points: number[] = [];
    for (let k = 0; k < 12; k++) points.push(x0 + k * 2, y0 + (k % 2) * 8, 0.5);
    const marker = i % 5 === 4;
    return {
      id: `n${i}`,
      type: 'stroke',
      tool: marker ? 'highlighter' : 'ballpoint',
      color: marker ? '#fde047' : '#1d4ed8',
      width: marker ? 12 : 2,
      points,
    };
  });
  const saved = await page.request.put(`/api/v1/notebooks/${notebookId}/pages/${pageId}/content`, {
    headers: {
      ...headers,
      'Content-Type': 'application/vnd.hucescholar.page+json',
      'If-Match': `"${detail.pages[0].revision}"`,
    },
    data: JSON.stringify({ v: 1, items }),
  });
  expect(saved.status()).toBe(200);

  await page.goto(`/workspace/notes/${notebookId}?page=${pageId}`);
  const surface = page.locator('svg.note-surface');

  // An open notebook uses the whole window; the navigation drops from the ☰ menu.
  const nav = page.getByRole('navigation', { name: 'Điều hướng không gian' });
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await expect(surface).toBeVisible();
  await expect(nav).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Vở ghi' })).toBeHidden();
  const editorBox = (await page.locator('.notebook-editor').boundingBox())!;
  expect(editorBox.width).toBeGreaterThan(page.viewportSize()!.width - 60);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  await menu.click();
  await expect(nav.getByRole('link', { name: 'Kho học liệu' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.click();
  await expect(nav).toBeVisible();
  // A press beside the menu (the header's right end, clear of the dropped list) closes it.
  const header = (await page.locator('.workspace-header').boundingBox())!;
  await page.mouse.click(header.x + header.width - 260, header.y + header.height / 2);
  await expect(nav).toBeHidden();

  const runs = surface.locator('[data-note-raster]');
  // Ink in one multiply layer for the highlighter and one for the pens, both painted.
  await expect(runs).toHaveCount(2);
  await expect(surface.locator('[data-note-raster][data-ready]')).toHaveCount(2, {
    timeout: 20_000,
  });
  await expect(surface.locator('[data-note-raster] image').first()).toBeVisible();
  expect(await surface.locator('[data-note-item]').count()).toBe(0);
  // The thumbnail is a bitmap too.
  await expect(page.locator('.note-thumb-svg [data-note-raster] image').first()).toBeAttached({
    timeout: 20_000,
  });

  // A marquee over the first row: those strokes are drawn as vectors while selected.
  await page.locator('.note-tool[data-tool="select"]').click();
  const box = (await surface.boundingBox())!;
  const toScreen = async (x: number, y: number) =>
    surface.evaluate(
      (node, p) => {
        const g = node.querySelector('g[transform]')!;
        const m = (g as SVGGraphicsElement).getScreenCTM()!;
        const pt = new DOMPoint(p.x, p.y).matrixTransform(m);
        return { x: pt.x, y: pt.y };
      },
      { x, y },
    );
  const from = await toScreen(40, 66),
    to = await toScreen(740, 104);
  expect(from.x).toBeGreaterThan(box.x);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2);
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();
  await expect(page.getByRole('toolbar', { name: 'Đã chọn 20 đối tượng' })).toBeVisible();
  await expect(surface.locator('[data-note-item]')).toHaveCount(20);

  // Deleting them repaints the tiles without them; undo brings them back.
  await page
    .getByRole('toolbar', { name: 'Đã chọn 20 đối tượng' })
    .getByRole('button', { name: 'Xóa', exact: true })
    .click();
  await expect(page.locator('.note-save')).toHaveText('Đã lưu', { timeout: 15_000 });
  const count = async () =>
    (await (await page.request.get(`/api/v1/notebooks/${notebookId}/pages/${pageId}`)).json()).page
      .content.items.length;
  expect(await count()).toBe(380);
  await expect(surface.locator('[data-note-raster][data-ready]')).toHaveCount(2, {
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(page.locator('.note-save')).toHaveText('Đã lưu', { timeout: 15_000 });
  expect(await count()).toBe(400);

  // Print and PDF stay vector: one path per stroke.
  await page.goto(`/workspace/notes/${notebookId}/print`);
  await expect(page.getByRole('status').filter({ hasText: '1 trang sẵn sàng' })).toBeVisible({
    timeout: 20_000,
  });
  expect(await page.locator('.note-print-page path').count()).toBeGreaterThanOrEqual(400);
  expect(await page.locator('.note-print-page image').count()).toBe(0);
});
