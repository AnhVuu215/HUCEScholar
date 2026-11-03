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
