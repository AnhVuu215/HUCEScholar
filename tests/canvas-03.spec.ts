import { expect, test, type Page } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { readerHeaders, readerLogin } from './helpers/reader-session';

type Item = Record<string, unknown> & { type: string; points?: number[] };

async function newNotebook(page: Page, title: string) {
  const created = await page.request.post('/api/v1/notebooks', {
    headers: await readerHeaders(page),
    data: {
      title,
      cover: 'navy',
      courseId: null,
      defaultSize: 'A4_PORTRAIT',
      defaultPaper: 'BLANK',
      defaultColor: 'white',
      requestId: randomUUID(),
    },
  });
  expect(created.status()).toBe(201);
  const detail = await created.json();
  return { notebookId: detail.item.id as string, pageId: detail.pages[0].id as string };
}
async function items(page: Page, notebookId: string, pageId: string): Promise<Item[]> {
  const response = await page.request.get(`/api/v1/notebooks/${notebookId}/pages/${pageId}`);
  expect(response.status()).toBe(200);
  return (await response.json()).page.content.items;
}
const saved = (page: Page) =>
  expect(page.locator('.note-save')).toHaveText('Đã lưu', { timeout: 15_000 });
/** Page coordinates to screen pixels, through the canvas's own transform. */
async function screen(page: Page, x: number, y: number) {
  return page.locator('svg.note-surface').evaluate(
    (node, p) => {
      const g = node.querySelector('g[transform]') as SVGGraphicsElement;
      const pt = new DOMPoint(p.x, p.y).matrixTransform(g.getScreenCTM()!);
      return { x: pt.x, y: pt.y };
    },
    { x, y },
  );
}

test('a table is inserted from a grid, typed in Vietnamese, resized, found by its text and printed', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await readerLogin(page, 'student', 'canvas3');
  const word = `Điện-áp-${randomUUID().slice(0, 6)}`;
  const { notebookId, pageId } = await newNotebook(page, `Vở bảng ${randomUUID().slice(0, 6)}`);
  await page.goto(`/workspace/notes/${notebookId}?page=${pageId}`);
  await expect(page.locator('svg.note-surface')).toBeVisible();

  await page.getByText('Chèn', { exact: true }).click();
  await page.getByRole('button', { name: 'Bảng…' }).click();
  const picker = page.getByRole('dialog', { name: 'Chèn bảng' });
  await picker.getByRole('gridcell', { name: '3 hàng × 4 cột' }).click();
  await expect(picker).toBeHidden();

  const editor = page.getByRole('table', { name: 'Bảng đang sửa' });
  await expect(editor.getByRole('textbox', { name: 'Hàng 1, cột 1' })).toBeFocused();
  const values = [
    ['Đại lượng', 'Ký hiệu', 'Đơn vị', 'Ghi chú'],
    [word, 'U', 'vôn', 'đo song song'],
    ['Cường độ', 'I', 'ampe', 'đo nối tiếp'],
  ];
  for (const row of values)
    for (const cell of row) {
      await page.keyboard.type(cell);
      await page.keyboard.press('Tab');
    }
  // Tab in the last cell added a fourth row and moved there.
  await expect(editor.getByRole('textbox', { name: 'Hàng 4, cột 1' })).toBeFocused();
  await page.keyboard.type('Điện trở');
  if (process.env.CAPTURE_CANVAS3 === '1')
    await page.screenshot({ path: 'test-results/canvas3-table-editing.png' });
  // Drop the "Ghi chú" column.
  await editor.getByRole('textbox', { name: 'Hàng 1, cột 4' }).focus();
  await page
    .getByRole('toolbar', { name: 'Định dạng bảng' })
    .getByRole('button', { name: 'Xóa cột' })
    .click();
  await expect(editor.getByRole('textbox', { name: 'Hàng 1, cột 4' })).toHaveCount(0);
  await page
    .getByRole('toolbar', { name: 'Định dạng bảng' })
    .getByRole('button', { name: 'Xong' })
    .click();
  await saved(page);

  let table = (await items(page, notebookId, pageId)).find((i) => i.type === 'table')!;
  expect(table.header).toBe(true);
  expect(table.cols).toHaveLength(3);
  expect(table.cells).toEqual([
    ['Đại lượng', 'Ký hiệu', 'Đơn vị'],
    [word, 'U', 'vôn'],
    ['Cường độ', 'I', 'ampe'],
    ['Điện trở', '', ''],
  ]);
  // Cell text is searchable from the shelf.
  const found = await page.request.get(`/api/v1/notebooks?q=${encodeURIComponent(word)}`);
  expect((await found.json()).items.map((n: { id: string }) => n.id)).toContain(notebookId);

  await page.reload();
  const shown = page.locator(`svg.note-surface [data-note-table="${table.id}"]`);
  await expect(shown).toContainText(word);
  await expect(shown.locator('tr')).toHaveCount(4);
  if (process.env.CAPTURE_CANVAS3 === '1')
    await page.screenshot({ path: 'test-results/canvas3-table.png' });

  // Double-click opens it again; dragging the first column border widens that column.
  await page.locator('.note-tool[data-tool="select"]').click();
  const box = (await shown.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + 8);
  const handle = page.getByRole('separator', { name: 'Đổi độ rộng cột 1' });
  const at = (await handle.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + 10);
  await page.mouse.down();
  await page.mouse.move(at.x + 60, at.y + 10, { steps: 5 });
  await page.mouse.up();
  await page
    .getByRole('toolbar', { name: 'Định dạng bảng' })
    .getByRole('button', { name: 'Xong' })
    .click();
  await saved(page);
  table = (await items(page, notebookId, pageId)).find((i) => i.type === 'table')!;
  const cols = table.cols as number[];
  expect(cols[0]).toBeGreaterThan(cols[1]);
  expect(cols.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);

  await page.goto(`/workspace/notes/${notebookId}/print`);
  await expect(page.getByRole('status').filter({ hasText: '1 trang sẵn sàng' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('.note-print-page [data-note-table]')).toContainText('Cường độ');
});

test('ink started along the ruler follows its edge, at any angle the knob sets', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await readerLogin(page, 'student', 'canvas3');
  const { notebookId, pageId } = await newNotebook(page, `Vở thước ${randomUUID().slice(0, 6)}`);
  await page.goto(`/workspace/notes/${notebookId}?page=${pageId}`);
  await expect(page.locator('svg.note-surface')).toBeVisible();

  const toggle = page.getByRole('button', { name: 'Thước', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const ruler = page.locator('.note-ruler');
  await expect(ruler).toContainText('0°');
  const where = async () => {
    const m = /translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\)/.exec(
      (await ruler.getAttribute('transform'))!,
    )!;
    return { x: Number(m[1]), y: Number(m[2]), angle: Number(m[3]) };
  };
  const r = await where();
  // Rough wavy ink starting just above the top edge (y − 32) lands on one straight line.
  await page.locator('.note-tool[data-tool="pen"]').click();
  const start = await screen(page, r.x - 200, r.y - 38);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let k = 1; k <= 20; k++) {
    const q = await screen(page, r.x - 200 + k * 15, r.y - 38 + (k % 2 ? -9 : 9));
    await page.mouse.move(q.x, q.y);
  }
  await page.mouse.up();
  await saved(page);
  const flat = (await items(page, notebookId, pageId)).filter((i) => i.type === 'stroke');
  expect(flat).toHaveLength(1);
  const ys = flat[0].points!.filter((_, i) => i % 3 === 1);
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.6);
  const xs = flat[0].points!.filter((_, i) => i % 3 === 0);
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(250);

  // The knob turns the ruler; 45° snaps.
  const knob = await screen(page, r.x + (160 * 96) / 25.4 / 2 - 30, r.y);
  const target = await screen(page, r.x + 200, r.y - 200);
  await page.mouse.move(knob.x, knob.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.mouse.up();
  await expect(ruler).toContainText('45°');
  if (process.env.CAPTURE_CANVAS3 === '1')
    await page.screenshot({ path: 'test-results/canvas3-ruler.png' });
  const turned = await where();
  expect(turned.angle).toBe(-45);
  // Ink along the turned edge rises at 45°. Turned by −45°, the top edge runs through
  // (−22.6, −22.6) from the centre towards the upper right; both ends sit 5 units outside it.
  const a = await screen(page, turned.x - 82.7, turned.y + 30.5);
  const b = await screen(page, turned.x + 30.5, turned.y - 82.7);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2 + 12, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await saved(page);
  const strokes = (await items(page, notebookId, pageId)).filter((i) => i.type === 'stroke');
  expect(strokes).toHaveLength(2);
  const pts = strokes[1].points!;
  const n = pts.length / 3;
  const dx = pts[(n - 1) * 3] - pts[0],
    dy = pts[(n - 1) * 3 + 1] - pts[1];
  expect(Math.abs(Math.atan2(dy, dx) * (180 / Math.PI))).toBeCloseTo(45, 0);

  // Dragging the body moves it; R hides it.
  const body = await screen(page, turned.x - 120, turned.y + 120);
  const moved = await screen(page, turned.x - 120 + 50, turned.y + 120 + 20);
  await page.mouse.move(body.x, body.y);
  await page.mouse.down();
  await page.mouse.move(moved.x, moved.y, { steps: 4 });
  await page.mouse.up();
  const after = await where();
  expect(after.x).toBeCloseTo(turned.x + 50, 0);
  expect(after.y).toBeCloseTo(turned.y + 20, 0);
  await page.locator('svg.note-surface').focus();
  await page.keyboard.press('r');
  await expect(ruler).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  // Moving the ruler drew nothing.
  expect((await items(page, notebookId, pageId)).filter((i) => i.type === 'stroke')).toHaveLength(
    2,
  );
});
