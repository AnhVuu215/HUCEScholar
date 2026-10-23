import { expect, test, type Page } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { readerHeaders, readerLogin } from './helpers/reader-session';

const labels = ['Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7', 'CN'];
const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const short = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
const label = (d: Date) => `${labels[(d.getDay() + 6) % 7]}, ${short(d)}`;
const plus = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
const column = (page: Page, day: Date) =>
  page.locator(`.calendar-day-column[aria-label="${label(day)}"]`);

/** A due reminder as the worker records it; the worker itself is covered by integration tests. */
async function recordReminder(userEmail: string, itemId: string, eventAt: Date, title: string) {
  const environment = parseEnv(readFileSync('.local/test.env', 'utf8'));
  const url = new URL(environment.TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test')) throw new Error('Isolated test database required.');
  const { Client } = createRequire(`${process.cwd()}/apps/api/package.json`)('pg');
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    await db.query(
      "INSERT INTO hucescholar.notifications(user_id,kind,event_key,calendar_item_id,event_at,title,detail) SELECT id,'CALENDAR_REMINDER',$2,$3,$4,$5,'EVENT' FROM hucescholar.users WHERE email=$1",
      [userEmail, `reminder:${itemId}:${eventAt.getTime() / 1000}`, itemId, eventAt, title],
    );
  } finally {
    await db.end();
  }
}

test('sessions and tasks remind before they start, and the notice opens that week', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const run = randomUUID().slice(0, 8);
  const session = `Ôn Sức bền ${run}`;
  const task = `Nộp bài tập ${run}`;
  const today = new Date();
  const monday = plus(today, 7 - ((today.getDay() + 6) % 7));
  const [tuesday, friday] = [1, 4].map((n) => plus(monday, n));

  await readerLogin(page, 'student', 'cal3');
  const headers = await readerHeaders(page);
  const span = new URLSearchParams({
    from: plus(monday, -7).toISOString(),
    to: plus(monday, 21).toISOString(),
  });
  const leftovers = new Map<string, number>();
  for (const url of [`/api/v1/calendar/items?${span}`, '/api/v1/calendar/tasks?limit=100'])
    for (const item of (await (await page.request.get(url)).json()).items)
      leftovers.set(item.id, item.revision);
  for (const [id, revision] of leftovers)
    await page.request.delete(`/api/v1/calendar/items/${id}`, { headers, data: { revision } });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/workspace/calendar');
  await expect(page.getByRole('heading', { level: 2, name: /–/ })).toBeVisible();
  await page.locator('#calendar-heading').click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#calendar-heading')).toHaveText(new RegExp(`^${short(monday)} – `));

  // Next Tuesday 14:00–15:00, reminded 15 minutes before, also by email.
  await page.getByRole('button', { name: 'Thêm lịch học', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Thêm lịch học' });
  await editor.getByLabel('Tiêu đề', { exact: true }).fill(session);
  await editor.getByLabel('Ngày bắt đầu', { exact: true }).fill(key(tuesday));
  await editor.getByLabel('Giờ bắt đầu', { exact: true }).fill('14:00');
  await editor.getByLabel('Ngày kết thúc', { exact: true }).fill(key(tuesday));
  await editor.getByLabel('Giờ kết thúc', { exact: true }).fill('15:00');
  await expect(editor.getByLabel('Gửi cả email')).toHaveCount(0);
  await editor.getByLabel('Nhắc', { exact: true }).selectOption({ label: 'Trước 15 phút' });
  await editor.getByLabel('Gửi cả email').check();
  await expect(editor).toContainText('Thư chỉ có tiêu đề, không có ghi chú.');
  await editor.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Đã lưu: ${session}` })).toBeVisible();
  const block = column(page, tuesday).locator('.calendar-session', { hasText: session });
  await expect(block).toHaveAttribute('title', /Nhắc: trước 15 phút/);
  const saved = (await (await page.request.get(`/api/v1/calendar/items?${span}`)).json()).items;
  const item = saved.find((i: { title: string }) => i.title === session);
  expect(item.reminder).toEqual({ minutes: 15, email: true });

  // The notice reads in local time and opens the week of the session.
  await recordReminder('e2e-cal3-student@example.test', item.id, new Date(item.startsAt), session);
  await page.goto('/workspace/notifications');
  const notice = page.locator('.notification-items li', { hasText: session });
  await expect(notice).toContainText(
    `Nhắc lịch học: “${session}” bắt đầu lúc 14:00 ${label(tuesday)}/${tuesday.getFullYear()}.`,
  );
  await notice.getByRole('link', { name: 'Mở lịch' }).click();
  await expect(page).toHaveURL(/\/workspace\/calendar\?at=/);
  await expect(page.locator('#calendar-heading')).toHaveText(new RegExp(`^${short(monday)} – `));
  await expect(block).toBeVisible();
  await page.goto('/workspace/notifications');
  await expect(notice).toContainText('Đã đọc');

  // The form shows the saved reminder; an all-day session cannot remind.
  await page.goto(`/workspace/calendar?at=${encodeURIComponent(item.startsAt)}`);
  await block.click();
  const edit = page.getByRole('form', { name: 'Sửa lịch học' });
  await expect(edit.getByLabel('Nhắc', { exact: true })).toHaveValue('15');
  await expect(edit.getByLabel('Gửi cả email')).toBeChecked();
  await edit.getByLabel('Cả ngày', { exact: true }).check();
  await expect(edit.getByLabel('Nhắc', { exact: true })).toHaveCount(0);
  await edit.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Đã lưu: ${session}` })).toBeVisible();
  const allDay = (await (await page.request.get(`/api/v1/calendar/items?${span}`)).json()).items;
  expect(allDay.find((i: { title: string }) => i.title === session).reminder).toBeNull();

  // A task due Friday 10:00 with a reminder: dragging it back to the panel drops the date and
  // the reminder together.
  const created = await page.request.post('/api/v1/calendar/items', {
    headers,
    data: {
      kind: 'TASK',
      title: task,
      details: '',
      startsAt: new Date(
        friday.getFullYear(),
        friday.getMonth(),
        friday.getDate(),
        10,
      ).toISOString(),
      endsAt: null,
      allDay: false,
      color: 'blue',
      versionId: null,
      pageNumber: null,
      remindMinutes: 0,
      requestId: randomUUID(),
    },
  });
  expect(created.status()).toBe(201);
  await page.reload();
  const tasks = page.getByRole('complementary', { name: 'Việc cần làm' });
  await expect(tasks.locator('li', { hasText: task })).toContainText('Nhắc: lúc bắt đầu');
  await page
    .locator('.calendar-week-strip .calendar-chip', { hasText: task })
    .dragTo(tasks.getByRole('heading', { name: 'Việc cần làm' }));
  await expect(page.getByRole('status').filter({ hasText: `Đã bỏ ngày: ${task}` })).toBeVisible();
  const open = (await (await page.request.get('/api/v1/calendar/tasks?limit=100')).json()).items;
  expect(open.find((i: { title: string }) => i.title === task)).toMatchObject({
    startsAt: null,
    reminder: null,
  });

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: 'Thêm lịch học', exact: true }).click();
    await expect(page.getByLabel('Nhắc', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  }
});
