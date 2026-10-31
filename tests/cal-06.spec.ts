import { expect, test } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { openReaderFixture, readerHeaders, readerLogin } from './helpers/reader-session';

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

test('a series every other week ends after a count, splits and truncates from an occurrence, and a task repeats', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const run = randomUUID().slice(0, 8);
  const session = `Thí nghiệm ${run}`;
  await readerLogin(page, 'student', 'cal6');
  await page.goto('/workspace/calendar');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const key = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;

  await page.getByRole('button', { name: 'Thêm lịch học', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Thêm lịch học' });
  await editor.getByLabel('Tiêu đề', { exact: true }).fill(session);
  await editor.getByLabel('Ngày bắt đầu', { exact: true }).fill(key);
  await editor.getByLabel('Giờ bắt đầu', { exact: true }).fill('08:00');
  await editor.getByLabel('Ngày kết thúc', { exact: true }).fill(key);
  await editor.getByLabel('Giờ kết thúc', { exact: true }).fill('09:00');
  await editor.getByLabel('Lặp lại', { exact: true }).check();
  await editor.getByLabel('Mỗi bao nhiêu tuần', { exact: true }).fill('2');
  await editor.getByRole('radio', { name: 'Sau số lần' }).check();
  await editor.getByLabel('Số lần', { exact: true }).fill('3');
  await editor.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Đã lưu: ${session}` })).toBeVisible();

  // The agenda (today + 30 days) holds all three, two weeks apart.
  await page.getByRole('button', { name: 'Lịch biểu', exact: true }).click();
  const rows = (title: string) => page.locator('.calendar-agenda li').filter({ hasText: title });
  await expect(rows(session)).toHaveCount(3);
  await expect(rows(session).first()).toContainText('Lặp mỗi 2 tuần');

  // The second and later ones get a new title; the first keeps its own.
  await rows(session).nth(1).getByRole('button', { name: session, exact: true }).click();
  const edit = page.getByRole('form', { name: 'Sửa lịch học' });
  await edit.getByRole('radio', { name: 'Buổi này và các buổi sau' }).check();
  await edit.getByLabel('Tiêu đề', { exact: true }).fill(`${session} (phòng mới)`);
  await edit.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(rows(`${session} (phòng mới)`)).toHaveCount(2);
  await expect(rows(session)).toHaveCount(3);
  // From the last one on, deleting removes just that one here.
  await rows(`${session} (phòng mới)`)
    .nth(1)
    .getByRole('button', { name: `${session} (phòng mới)`, exact: true })
    .click();
  await page.getByRole('radio', { name: 'Buổi này và các buổi sau' }).check();
  await page.getByRole('button', { name: 'Xóa buổi này và các buổi sau', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await expect(rows(`${session} (phòng mới)`)).toHaveCount(1);
  await expect(rows(session)).toHaveCount(2);

  // A weekly task: the panel lists the next undone time; ticking it moves on.
  const task = `Nộp báo cáo tuần ${run}`;
  const headers = await readerHeaders(page);
  const due = new Date(tomorrow);
  due.setHours(17, 0, 0, 0);
  const created = await page.request.post('/api/v1/calendar/items', {
    headers,
    data: {
      kind: 'TASK',
      title: task,
      details: '',
      startsAt: due.toISOString(),
      endsAt: null,
      allDay: false,
      color: 'red',
      versionId: null,
      pageNumber: null,
      repeat: {
        freq: 'WEEKLY',
        interval: 1,
        weekdays: [((due.getDay() + 6) % 7) + 1],
        count: 3,
        utcOffset: -due.getTimezoneOffset(),
      },
      requestId: randomUUID(),
    },
  });
  expect(created.status()).toBe(201);
  await page.reload();
  const tasks = page.getByRole('complementary', { name: 'Việc cần làm' });
  const open = tasks.getByRole('list').first().locator('li').filter({ hasText: task });
  await expect(open).toHaveCount(1);
  const first = await open.textContent();
  await open.getByRole('checkbox', { name: `Hoàn thành: ${task}` }).check();
  await expect(page.getByRole('status').filter({ hasText: `Đã xong: ${task}` })).toBeVisible();
  await expect(open).toHaveCount(1);
  await expect(open).not.toHaveText(first!);
  await tasks.getByRole('button', { name: 'Xem việc đã xong', exact: true }).click();
  await expect(
    tasks.getByRole('list', { name: 'Việc đã xong' }).getByRole('button', { name: task }),
  ).toHaveCount(1);
});
