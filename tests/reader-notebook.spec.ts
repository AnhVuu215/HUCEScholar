import { expect, test, type Page } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { openReaderFixture, readerHeaders, readerLogin } from './helpers/reader-session';

let fixture: Awaited<ReturnType<typeof openReaderFixture>>;
let otherVersion: Awaited<ReturnType<typeof openReaderFixture>>;
let secondPageNote: { id: string; content: string };
let specialNote: { id: string; revision: number };
const notebook = (page: Page) =>
  page.getByRole('region', { name: 'Sổ ghi chú phiên bản này', exact: true });
async function search(page: Page, text: string) {
  await notebook(page).getByLabel('Tìm trong ghi chú', { exact: true }).fill(text);
  await notebook(page).getByRole('button', { name: 'Tìm ghi chú', exact: true }).click();
}
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  fixture = await openReaderFixture(page, 'notebook');
  const headers = await readerHeaders(page);
  for (let i = 0; i < 24; i++) {
    const response = await page.request.post(`${fixture.path}/notes`, {
      headers,
      data: { pageNumber: (i % 2) + 1, content: `Ôn tập ${i}`, requestId: randomUUID() },
    });
    expect(response.status()).toBe(201);
    if (i === 1) secondPageNote = (await response.json()).item;
  }
  expect(
    (
      await page.request.post(`${fixture.path}/highlights`, {
        headers,
        data: {
          pageNumber: 2,
          content: 'Nội dung màu hồng',
          color: '#F8BBD0',
          requestId: randomUUID(),
          anchor: {
            coordinateSpace: 'normalized-pdf-v1',
            quote: 'Trích dẫn 50%_\\ tiếng Việt',
            quads: [[0.1, 0.8, 0.6, 0.8, 0.6, 0.75, 0.1, 0.75]],
          },
        },
      })
    ).status(),
  ).toBe(201);
  const special = await page.request.post(`${fixture.path}/notes`, {
    headers,
    data: { pageNumber: 2, content: 'Ghi chú kiểm tra xung đột', requestId: randomUUID() },
  });
  expect(special.status()).toBe(201);
  specialNote = (await special.json()).item;
  otherVersion = await openReaderFixture(page, 'notebook');
  await page.close();
});
test.beforeEach(async ({ page }) => {
  await readerLogin(page, 'student', 'notebook');
  await page.goto(`${fixture.route}?page=1`);
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
  ).toBeVisible();
});
test('notebook paginates, filters literal text/color and opens the existing highlight editor on its page', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Toàn tài liệu', exact: true }).click();
  await expect(notebook(page).getByRole('article')).toHaveCount(20);
  await notebook(page).getByRole('button', { name: 'Tải thêm ghi chú', exact: true }).click();
  await expect(notebook(page).getByRole('article')).toHaveCount(26);
  await notebook(page).getByRole('combobox', { name: 'Loại ghi chú', exact: true }).click();
  await page.getByRole('option', { name: 'Ghi chú trang', exact: true }).click();
  await search(page, 'Ôn tập');
  await expect(notebook(page).getByRole('article')).toHaveCount(20);
  await notebook(page).getByRole('button', { name: 'Tải thêm ghi chú', exact: true }).click();
  await expect(notebook(page).getByRole('article')).toHaveCount(24);
  await expect(
    notebook(page).getByRole('combobox', { name: 'Màu tô', exact: true }),
  ).toBeDisabled();
  await notebook(page).getByRole('combobox', { name: 'Loại ghi chú', exact: true }).click();
  await page.getByRole('option', { name: 'Đoạn tô', exact: true }).click();
  await notebook(page).getByRole('combobox', { name: 'Màu tô', exact: true }).click();
  await page.getByRole('option', { name: 'Hồng', exact: true }).click();
  await search(page, '50%_\\ TIẾNG');
  await expect(notebook(page).getByRole('article')).toHaveCount(1);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await notebook(page).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(
      notebook(page).getByRole('button', { name: 'Tìm ghi chú', exact: true }),
    ).toBeVisible();
  }
  await notebook(page).getByRole('button', { name: 'Mở đoạn tô · Trang 2', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' }),
  ).toBeVisible();
  await expect(page.getByLabel('Ghi chú cho đoạn tô', { exact: true })).toHaveValue(
    'Nội dung màu hồng',
  );
  await expect(page.getByLabel('Ghi chú cho đoạn tô', { exact: true })).toBeFocused();
  expect(page.url()).not.toContain('TI%E1%BA%BENG');
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain('50%_');
  await page.getByRole('button', { name: 'Hủy vùng tô', exact: true }).click();
});
test('browsing and filtering preserve a draft; opening another note asks once and reuses the page editor', async ({
  page,
}) => {
  const input = page.getByLabel('Nội dung ghi chú', { exact: true });
  await input.fill('Bản soạn cần giữ');
  await page.getByRole('tab', { name: 'Toàn tài liệu', exact: true }).click();
  await search(page, secondPageNote.content);
  await expect(notebook(page).getByRole('article')).toHaveCount(11); // Literal substring also matches 10–19.
  const target = notebook(page).getByRole('article', {
    name: `Mục ghi chú ${secondPageNote.id}`,
    exact: true,
  });
  page.once('dialog', (dialog) => dialog.dismiss());
  await target.getByRole('button', { name: 'Mở ghi chú · Trang 2', exact: true }).click();
  await expect(notebook(page)).toBeVisible();
  await page.getByRole('tab', { name: 'Trang này', exact: true }).click();
  await expect(input).toHaveValue('Bản soạn cần giữ');
  await page.getByRole('tab', { name: 'Toàn tài liệu', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await target.getByRole('button', { name: 'Mở ghi chú · Trang 2', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' }),
  ).toBeVisible();
  await expect(input).toHaveValue(secondPageNote.content);
  await expect(input).toBeFocused();
  await page.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
});
test('failed pagination retries without duplicates and a delayed old search cannot replace the new filter', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Toàn tài liệu', exact: true }).click();
  await expect(notebook(page).getByRole('article')).toHaveCount(20);
  await page.getByRole('tab', { name: 'Trang này', exact: true }).click();
  let refreshReady!: () => void;
  let releaseRefresh!: () => void;
  const refreshStarted = new Promise<void>((resolve) => {
    refreshReady = resolve;
  });
  const refreshBarrier = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await page.route('**/annotations/search', async (route) => {
    const response = await route.fetch();
    refreshReady();
    await refreshBarrier;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByRole('tab', { name: 'Toàn tài liệu', exact: true }).click();
  await refreshStarted;
  await expect(
    notebook(page).getByRole('button', { name: 'Tải thêm ghi chú', exact: true }),
  ).toHaveCount(0);
  releaseRefresh();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(notebook(page).getByRole('article')).toHaveCount(20);
  await page.route('**/annotations/search', (route) => route.abort('timedout'), { times: 1 });
  await notebook(page).getByRole('button', { name: 'Tải thêm ghi chú', exact: true }).click();
  await expect(notebook(page).getByRole('alert')).toBeVisible();
  await expect(notebook(page).getByRole('article')).toHaveCount(20);
  await notebook(page).getByRole('button', { name: 'Thử lại tìm kiếm', exact: true }).click();
  await expect(notebook(page).getByRole('article')).toHaveCount(26);
  expect(
    new Set(
      await notebook(page)
        .getByRole('article')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label'))),
    ).size,
  ).toBe(26);
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route('**/annotations/search', async (route) => {
    if (route.request().postDataJSON().query !== 'Ôn tập 1') return route.continue();
    const response = await route.fetch();
    started();
    await barrier;
    await route.fulfill({ response }).catch(() => {});
  });
  await search(page, 'Ôn tập 1');
  await pending;
  await search(page, '50%_\\');
  await expect(notebook(page).getByRole('article')).toHaveCount(1);
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(notebook(page).getByRole('article')).toHaveCount(1);
  await expect(notebook(page)).toContainText('Nội dung màu hồng');
});
test('stale search results keep CAS protection; refresh handles a deleted last result and lost access', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Toàn tài liệu', exact: true }).click();
  await search(page, 'kiểm tra xung đột');
  await expect(notebook(page).getByRole('article')).toHaveCount(1);
  const updated = await page.request.patch(`${fixture.path}/notes/${specialNote.id}`, {
    headers: await readerHeaders(page),
    data: { revision: specialNote.revision, content: 'Ghi chú kiểm tra xung đột mới' },
  });
  expect(updated.status()).toBe(200);
  specialNote = (await updated.json()).item;
  await notebook(page).getByRole('button', { name: 'Mở ghi chú · Trang 2', exact: true }).click();
  await page.getByLabel('Nội dung ghi chú', { exact: true }).fill('Bản sửa cần giữ khi xung đột');
  await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Ghi chú đã thay đổi' })).toBeVisible();
  await expect(page.getByLabel('Nội dung ghi chú', { exact: true })).toHaveValue(
    'Bản sửa cần giữ khi xung đột',
  );
  await page.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
  expect(
    (
      await page.request.delete(`${fixture.path}/notes/${specialNote.id}`, {
        headers: await readerHeaders(page),
        data: { revision: specialNote.revision },
      })
    ).status(),
  ).toBe(204);
  await page.getByRole('tab', { name: 'Toàn tài liệu', exact: true }).click();
  await expect(notebook(page).getByRole('article')).toHaveCount(0);
  await expect(notebook(page)).toContainText('Không có ghi chú phù hợp');
  await search(page, '');
  await expect(notebook(page).getByRole('article')).toHaveCount(20);
  await page.route('**/annotations/search', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
  );
  await notebook(page).getByRole('button', { name: 'Làm mới danh sách', exact: true }).click();
  await expect(notebook(page).getByRole('alert')).toBeVisible();
  await expect(notebook(page).getByRole('article')).toHaveCount(0);
});
test('switching versions aborts the old search and leaves the new version empty', async ({
  page,
}) => {
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(`**/versions/${fixture.versionId}/annotations/search`, async (route) => {
    const response = await route.fetch();
    started();
    await barrier;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByRole('tab', { name: 'Toàn tài liệu', exact: true }).click();
  await pending;
  await page.goto(`${otherVersion.route}?page=1`);
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Toàn tài liệu', exact: true }).click();
  await expect(notebook(page)).toContainText('Không có ghi chú phù hợp');
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(notebook(page).getByRole('article')).toHaveCount(0);
});
