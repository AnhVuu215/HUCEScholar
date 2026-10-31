import { expect, test } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { openReaderFixture, readerHeaders } from './helpers/reader-session';

test('done tasks reopen from their own list and a session links a document picked in the form', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const run = randomUUID().slice(0, 8);
  const fixture = await openReaderFixture(page, 'cal6');
  const title = (
    await (await page.request.get(`/api/v1/library/versions/${fixture.versionId}`)).json()
  ).item.title as string;
  const headers = await readerHeaders(page);
  const created = await page.request.post('/api/v1/calendar/items', {
    headers,
    data: {
      kind: 'TASK',
      title: `Đã nộp ${run}`,
      details: '',
      startsAt: null,
      endsAt: null,
      allDay: false,
      color: 'blue',
      versionId: null,
      pageNumber: null,
      requestId: randomUUID(),
    },
  });
  const task = (await created.json()).item;
  expect(
    (
      await page.request.put(`/api/v1/calendar/items/${task.id}/done`, {
        headers,
        data: { done: true },
      })
    ).status(),
  ).toBe(200);

  await page.goto('/workspace/calendar');
  const tasks = page.getByRole('complementary', { name: 'Việc cần làm' });
  await expect(tasks.getByRole('button', { name: `Đã nộp ${run}`, exact: true })).toHaveCount(0);
  const reveal = tasks.getByRole('button', { name: 'Xem việc đã xong', exact: true });
  await reveal.click();
  await expect(tasks.getByRole('button', { name: 'Ẩn việc đã xong' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const done = tasks.getByRole('list', { name: 'Việc đã xong' });
  await done.getByRole('checkbox', { name: `Hoàn thành: Đã nộp ${run}` }).uncheck();
  await expect(page.getByRole('status').filter({ hasText: `Mở lại: Đã nộp ${run}` })).toBeVisible();
  // Reopened: back in the open list, gone from the done one.
  await expect(
    tasks
      .getByRole('list')
      .first()
      .getByRole('button', { name: `Đã nộp ${run}`, exact: true }),
  ).toBeVisible();
  await expect(done.getByRole('button', { name: `Đã nộp ${run}`, exact: true })).toHaveCount(0);

  // A session gets its document from a search in the form, at a chosen page.
  await page.getByRole('button', { name: 'Tuần', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm lịch học', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Thêm lịch học' });
  await editor.getByLabel('Tiêu đề', { exact: true }).fill(`Đọc có tài liệu ${run}`);
  await editor.getByRole('button', { name: 'Gắn tài liệu', exact: true }).click();
  const search = editor.getByRole('searchbox', { name: 'Tìm tài liệu để gắn', exact: true });
  await expect(search).toBeFocused();
  await search.fill(title);
  await editor
    .getByRole('list', { name: 'Kết quả tìm tài liệu' })
    .getByRole('button', { name: title, exact: true })
    .click();
  await expect(editor.getByRole('link', { name: title, exact: true })).toBeVisible();
  await editor.getByLabel('Trang', { exact: true }).fill('2');
  await editor.getByRole('button', { name: 'Lưu', exact: true }).click();
  const block = page.locator('.calendar-session', { hasText: `Đọc có tài liệu ${run}` });
  await expect(block).toBeVisible();
  await block.click();
  const edit = page.getByRole('form', { name: 'Sửa lịch học' });
  await expect(edit.getByRole('link', { name: title, exact: true })).toHaveAttribute(
    'href',
    `${fixture.route}?page=2`,
  );
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
