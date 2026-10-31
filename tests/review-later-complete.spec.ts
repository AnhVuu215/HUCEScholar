import { expect, test, type Page } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { openReaderFixture, readerHeaders } from './helpers/reader-session';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Cần xem lại', exact: true });
async function choose(page: Page, label: string, option: string) {
  await panel(page).getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('"cần xem lại" is marked in the reader lists, booked from the notebook, exported, filtered on the calendar and reviewed', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const token = randomUUID().slice(0, 8);
  const first = await openReaderFixture(page, 'review2');
  const second = await openReaderFixture(page, 'review2');
  const headers = await readerHeaders(page);
  const post = async (path: string, data: object) => {
    const response = await page.request.post(path, { headers, data });
    expect(response.status()).toBe(201);
    return (await response.json()).item;
  };
  const elsewhere = await post(`${first.path}/notes`, {
    pageNumber: 1,
    content: `${token} tài liệu một`,
    requestId: randomUUID(),
  });
  const note = await post(`${second.path}/notes`, {
    pageNumber: 1,
    content: `${token} chưa hiểu`,
    requestId: randomUUID(),
  });
  const highlight = await post(`${second.path}/highlights`, {
    pageNumber: 1,
    content: `${token} đoạn khó`,
    color: '#FFF59D',
    requestId: randomUUID(),
    anchor: {
      coordinateSpace: 'normalized-pdf-v1',
      quote: 'HUCEScholar reader fixture',
      quads: [[0.08, 0.9, 0.5, 0.9, 0.5, 0.88, 0.08, 0.88]],
    },
  });
  expect(
    (
      await page.request.put(`${first.path}/annotations/${elsewhere.id}/review-later`, {
        headers,
        data: { reviewLater: true },
      })
    ).status(),
  ).toBe(200);

  // 1. Marked straight from this page's lists, without opening the notebook.
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' })).toBeVisible(
    { timeout: 15000 },
  );
  await page.getByRole('tab', { name: 'Ghi chú trang', exact: true }).click();
  const noteRow = page.getByRole('article', { name: `Ghi chú ${note.id}`, exact: true });
  await noteRow.getByRole('button', { name: 'Đánh dấu cần xem lại', exact: true }).click();
  await expect(noteRow).toContainText('Cần xem lại');
  await expect(
    noteRow.getByRole('button', { name: 'Bỏ dấu cần xem lại', exact: true }),
  ).toBeFocused();
  // The note's revision is unchanged, so editing right after still saves.
  await noteRow.getByRole('button', { name: 'Sửa', exact: true }).click();
  await page.getByLabel('Nội dung ghi chú', { exact: true }).fill(`${token} chưa hiểu rõ`);
  await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
  await expect(noteRow).toContainText(`${token} chưa hiểu rõ`);
  await expect(noteRow).toContainText('Cần xem lại');
  await page.getByRole('tab', { name: 'Đoạn tô', exact: true }).click();
  const highlightRow = page.getByRole('article', { name: `Vùng tô ${highlight.id}`, exact: true });
  await highlightRow.getByRole('button', { name: 'Đánh dấu cần xem lại', exact: true }).click();
  await expect(highlightRow).toContainText('Cần xem lại');

  // 2. A marked notebook entry books its review session in place.
  await page.getByRole('tab', { name: 'Toàn tài liệu', exact: true }).click();
  const notebook = page.getByRole('region', { name: 'Sổ ghi chú phiên bản này', exact: true });
  const marked = notebook.getByRole('article').filter({ hasText: `${token} chưa hiểu rõ` });
  await marked.getByRole('button', { name: 'Lên lịch ôn', exact: true }).click();
  await marked.getByRole('button', { name: 'Thêm vào lịch', exact: true }).click();
  await expect(marked.getByRole('status')).toContainText('Đã thêm buổi ôn vào lịch.');

  // 3. The exported file labels both marks.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    notebook.getByRole('button', { name: 'Văn bản (.txt)', exact: true }).click(),
  ]);
  const text = await readFile((await download.path())!, 'utf8');
  expect(text).toContain(`- Ghi chú trang [Cần xem lại]: ${token} chưa hiểu rõ`);
  expect(text).toContain('- Đoạn tô (vàng) [Cần xem lại]: “HUCEScholar reader fixture”');

  // 4. The calendar panel filters by document, then starts a session over those marks.
  const title = (
    await (await page.request.get(`/api/v1/library/versions/${second.versionId}`)).json()
  ).item.title;
  await page.goto('/workspace/calendar');
  // A "Lên lịch ôn" form opened before filtering keeps what was typed.
  const row = panel(page)
    .getByRole('listitem')
    .filter({ hasText: `${token} chưa hiểu rõ` });
  await row.getByRole('button', { name: 'Lên lịch ôn', exact: true }).click();
  await row.getByLabel('Giờ bắt đầu', { exact: true }).fill('07:30');
  await choose(page, 'Tài liệu', `${title} (2)`);
  await expect(row.getByLabel('Giờ bắt đầu', { exact: true })).toHaveValue('07:30');
  await row.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(panel(page).getByRole('listitem')).toHaveCount(2);
  await expect(panel(page)).not.toContainText(`${token} tài liệu một`);
  await panel(page).getByRole('link', { name: 'Ôn lần lượt 2 mục đang lọc', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\/notebook\?review=marked&versionId=\d+$/);
  const session = page.getByRole('region', { name: 'Buổi ôn tập', exact: true });
  await expect(session.getByRole('article')).toHaveAccessibleName('Mục 1 / 2');
  await expect(page.getByLabel('Chỉ mục cần xem lại', { exact: true })).toBeChecked();
  for (const n of [1, 2])
    await session
      .getByRole('button', { name: n === 2 ? 'Đã xem, kết thúc' : 'Đã xem, mục tiếp', exact: true })
      .click();
  await expect(session.getByRole('heading', { name: 'Đã xem hết 2 mục' })).toBeVisible();
  // Back in the notebook, the one-document limit ends with the session; the mark filter stays.
  await session.getByRole('button', { name: 'Về sổ tay', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Ghi chú trên mọi tài liệu' })
      .getByRole('article')
      .filter({
        hasText: `${token} tài liệu một`,
      }),
  ).toHaveCount(1);

  // 5. The course filter narrows the panel to the other document's course.
  const course = (
    await (await page.request.get(`/api/v1/library/versions/${first.versionId}`)).json()
  ).item.courses[0];
  await page.goto('/workspace/calendar');
  await choose(page, 'Môn học', `${course.code} · ${course.name}`);
  await expect(panel(page).getByRole('listitem')).toHaveCount(1);
  await expect(panel(page)).toContainText(`${token} tài liệu một`);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
