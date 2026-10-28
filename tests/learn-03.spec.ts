import { expect, test, type Page } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { openReaderFixture, readerHeaders } from './helpers/reader-session';

const notebook = (page: Page) =>
  page.getByRole('region', { name: 'Ghi chú trên mọi tài liệu', exact: true });
async function choose(page: Page, label: string, option: string) {
  await notebook(page).getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function search(page: Page, text: string) {
  await notebook(page).getByLabel('Tìm trong ghi chú', { exact: true }).fill(text);
  await notebook(page).getByRole('button', { name: 'Tìm ghi chú', exact: true }).click();
}
test('the notebook finds notes across documents, filters by course and opens the right page', async ({
  page,
}) => {
  const token = randomUUID().slice(0, 8);
  const first = await openReaderFixture(page, 'learn03');
  const second = await openReaderFixture(page, 'learn03');
  const headers = await readerHeaders(page);
  for (const [path, pageNumber, content] of [
    [first.path, 2, `${token} định nghĩa ở tài liệu một`],
    [second.path, 1, `${token} ví dụ ở tài liệu hai`],
  ] as const)
    expect(
      (
        await page.request.post(`${path}/notes`, {
          headers,
          data: { pageNumber, content, requestId: randomUUID() },
        })
      ).status(),
    ).toBe(201);
  const material = async (versionId: string) =>
    (await (await page.request.get(`/api/v1/library/versions/${versionId}`)).json()).item;
  const [one, two] = [await material(first.versionId), await material(second.versionId)];
  await page.goto('/workspace/library');
  await page.getByRole('link', { name: 'Sổ tay', exact: true }).first().click();
  await expect(page).toHaveURL(/\/workspace\/notebook$/);
  await search(page, token);
  // Newest document first, each under its own heading; the search text stays out of the URL.
  const groups = notebook(page).getByRole('region');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0).getByRole('heading')).toHaveText(two.title);
  await expect(groups.nth(1).getByRole('heading')).toHaveText(one.title);
  expect(page.url()).not.toContain(token);
  await choose(page, 'Môn học', `${one.courses[0].code} · ${one.courses[0].name}`);
  await search(page, token);
  await expect(groups).toHaveCount(1);
  await expect(notebook(page).getByRole('article')).toContainText('tài liệu một');
  // Marking from here is the same private mark as in the reader.
  const entry = notebook(page).getByRole('article');
  await entry.getByRole('button', { name: 'Đánh dấu cần xem lại', exact: true }).click();
  await expect(entry).toContainText('Cần xem lại');
  await expect(
    entry.getByRole('button', { name: 'Bỏ dấu cần xem lại', exact: true }),
  ).toBeFocused();
  await choose(page, 'Môn học', 'Mọi môn');
  await notebook(page).getByLabel('Chỉ mục cần xem lại', { exact: true }).check();
  await search(page, token);
  await expect(notebook(page).getByRole('article')).toHaveCount(1);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  // A failed search keeps the form and offers a retry.
  await page.route('**/notebook/search', (route) => route.abort('timedout'), { times: 1 });
  await search(page, token);
  await expect(notebook(page).getByRole('alert')).toContainText('Chưa tải được sổ tay');
  await notebook(page).getByRole('button', { name: 'Thử lại tìm kiếm', exact: true }).click();
  await expect(notebook(page).getByRole('article')).toHaveCount(1);
  await entry.getByRole('link', { name: 'Mở trang 2', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname + url.search === `${first.route}?page=2`);
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' }),
  ).toBeVisible();
});

test('EXPORT-02: the notebook downloads what the last search filtered as one file', async ({
  page,
}) => {
  const token = randomUUID().slice(0, 8);
  const first = await openReaderFixture(page, 'learn03');
  const second = await openReaderFixture(page, 'learn03');
  const headers = await readerHeaders(page);
  for (const [path, pageNumber, content] of [
    [first.path, 2, `${token} ý thứ nhất [link](https://x.test)`],
    [second.path, 1, `${token} ý thứ hai`],
  ] as const)
    expect(
      (
        await page.request.post(`${path}/notes`, {
          headers,
          data: { pageNumber, content, requestId: randomUUID() },
        })
      ).status(),
    ).toBe(201);
  await page.goto('/workspace/notebook');
  await search(page, token);
  await expect(notebook(page).getByRole('region')).toHaveCount(2);
  // Text typed after the search is not exported until searched.
  await notebook(page).getByLabel('Tìm trong ghi chú', { exact: true }).fill('khác');
  const group = notebook(page).getByRole('group', {
    name: 'Tải sổ tay theo bộ lọc đang xem',
    exact: true,
  });
  const markdown = page.waitForEvent('download');
  await group.getByRole('button', { name: 'Markdown (.md)', exact: true }).click();
  const md = await markdown;
  expect(md.suggestedFilename()).toBe('so-tay-ghi-chu.md');
  const content = Buffer.concat(await (await md.createReadStream()).toArray()).toString('utf8');
  expect(content).toContain(`- Bộ lọc: có chữ “${token}”`);
  expect(content.indexOf('ý thứ hai')).toBeLessThan(content.indexOf('ý thứ nhất'));
  expect(content).toContain(String.raw`ý thứ nhất \[link\]\(https\://x.test\)`);
  await expect(group.getByRole('status')).toHaveText('Đã tạo file ghi chú.');
  const text = page.waitForEvent('download');
  await group.getByRole('button', { name: 'Văn bản (.txt)', exact: true }).click();
  expect((await text).suggestedFilename()).toBe('so-tay-ghi-chu.txt');
  // Too many notes is a sentence, not an error page saved as a file.
  await page.route('**/personal-library/notebook/export', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'EXPORT_TOO_LARGE', message: 'x' }),
    }),
  );
  await group.getByRole('button', { name: 'Markdown (.md)', exact: true }).click();
  await expect(group.getByRole('status')).toHaveText(
    'Sổ tay có quá nhiều mục để xuất một lần. Thu hẹp bộ lọc rồi thử lại.',
  );
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('LEARN-03b: notes and highlights are edited and deleted in place, at the searched revision', async ({
  page,
}) => {
  const token = randomUUID().slice(0, 8);
  const first = await openReaderFixture(page, 'learn03b');
  const second = await openReaderFixture(page, 'learn03b');
  const headers = await readerHeaders(page);
  const created = await page.request.post(`${first.path}/notes`, {
    headers,
    data: {
      pageNumber: 2,
      content: `${token} ghi chú gốc`,
      position: { x: 0.4, y: 0.6 },
      requestId: randomUUID(),
    },
  });
  expect(created.status()).toBe(201);
  const note = (await created.json()).item;
  const marked = await page.request.post(`${second.path}/highlights`, {
    headers,
    data: {
      pageNumber: 1,
      content: `${token} đoạn tô gốc`,
      color: '#FFF59D',
      requestId: randomUUID(),
      anchor: {
        coordinateSpace: 'normalized-pdf-v1',
        quote: 'HUCEScholar reader fixture',
        quads: [[0.1, 0.9, 0.5, 0.9, 0.5, 0.87, 0.1, 0.87]],
      },
    },
  });
  expect(marked.status()).toBe(201);
  const highlight = (await marked.json()).item;
  const title = (
    await (await page.request.get(`/api/v1/library/versions/${second.versionId}`)).json()
  ).item.title;
  await page.goto('/workspace/notebook');
  await search(page, token);
  await expect(notebook(page).getByRole('article')).toHaveCount(2);
  const noteEntry = notebook(page).getByRole('article', { name: `Mục ghi chú ${note.id}` });
  const markEntry = notebook(page).getByRole('article', { name: `Mục ghi chú ${highlight.id}` });

  // Edit a page note's text; its pin on the page stays where it was.
  await noteEntry.getByRole('button', { name: 'Sửa', exact: true }).click();
  const noteText = noteEntry.getByLabel('Nội dung ghi chú', { exact: true });
  await expect(noteText).toBeFocused();
  await expect(noteEntry.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();
  await noteText.fill(`${token} ghi chú đã sửa`);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await noteEntry.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(noteEntry.getByRole('status')).toHaveText('Đã lưu ghi chú · Trang 2.');
  await expect(noteEntry).toContainText('ghi chú đã sửa');
  await expect(noteEntry.getByRole('button', { name: 'Sửa', exact: true })).toBeFocused();
  const saved = (
    await (await page.request.get(`${first.path}/notes?pageNumber=2`)).json()
  ).items.find((item: { id: string }) => item.id === note.id);
  expect(saved).toMatchObject({ content: `${token} ghi chú đã sửa`, position: { x: 0.4, y: 0.6 } });

  // Edit a highlight's colour and text; its quote stays.
  await markEntry.getByRole('button', { name: 'Sửa', exact: true }).click();
  await markEntry.getByLabel('Ghi chú kèm đoạn tô (không bắt buộc)').fill('');
  await markEntry.getByRole('combobox', { name: 'Màu tô', exact: true }).click();
  await page.getByRole('option', { name: 'Xanh dương', exact: true }).click();
  await markEntry.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(markEntry.getByRole('status')).toHaveText('Đã lưu vùng tô · Trang 1.');
  await expect(markEntry).toContainText('Đoạn tô · Xanh dương');
  await expect(markEntry).toContainText('HUCEScholar reader fixture');
  await expect(markEntry).not.toContainText('đoạn tô gốc');

  // A change made elsewhere since the search keeps the draft and asks for a new search.
  expect(
    (
      await page.request.patch(`${first.path}/notes/${note.id}`, {
        headers,
        data: { revision: saved.revision, content: `${token} sửa trong trình đọc` },
      })
    ).status(),
  ).toBe(200);
  await noteEntry.getByRole('button', { name: 'Sửa', exact: true }).click();
  await noteText.fill(`${token} bản soạn cũ`);
  await noteEntry.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(noteEntry.getByRole('alert')).toContainText('đã được sửa ở nơi khác');
  await expect(noteText).toHaveValue(`${token} bản soạn cũ`);
  await noteEntry.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(noteEntry.getByRole('button', { name: 'Sửa', exact: true })).toBeFocused();

  // Deleting asks first; keeping it returns focus, confirming removes the entry everywhere.
  await markEntry.getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(markEntry).toContainText('Xóa vùng tô và ghi chú kèm theo?');
  await markEntry.getByRole('button', { name: 'Giữ lại', exact: true }).click();
  await expect(markEntry.getByRole('button', { name: 'Xóa', exact: true })).toBeFocused();
  await markEntry.getByRole('button', { name: 'Xóa', exact: true }).click();
  await markEntry.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await expect(markEntry).toHaveCount(0);
  const removed = notebook(page)
    .getByRole('status')
    .filter({ hasText: `Đã xóa vùng tô · Trang 1 · ${title}.` });
  await expect(removed).toBeFocused();
  await search(page, token);
  await expect(notebook(page).getByRole('article')).toHaveCount(1);
  await expect(noteEntry).toContainText('sửa trong trình đọc');
});
