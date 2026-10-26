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
