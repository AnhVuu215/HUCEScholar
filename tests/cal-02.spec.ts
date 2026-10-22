import { expect, test, type Page } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { readerLogin } from './helpers/reader-session';

const labels = ['Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7', 'CN'];
const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const short = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
const label = (d: Date) => `${labels[(d.getDay() + 6) % 7]}, ${short(d)}`;
const plus = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
const column = (page: Page, day: Date) =>
  page.locator(`.calendar-day-column[aria-label="${label(day)}"]`);
const HOUR_PX = 48;

test('weekly sessions repeat, one session changes alone, and drag and drop moves items', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Unique names keep a retry from matching what an earlier attempt left behind.
  const run = randomUUID().slice(0, 8);
  const session = `Học nhóm ${run}`;
  const task = `Đọc chương 4 ${run}`;
  // Next week's Monday, Wednesday, Thursday, Friday, and the Monday after (local time).
  const today = new Date();
  const monday = plus(today, 7 - ((today.getDay() + 6) % 7));
  const [wednesday, thursday, friday, following] = [2, 3, 4, 7].map((n) => plus(monday, n));

  await readerLogin(page, 'student', 'cal2');
  await page.goto('/workspace/calendar');
  await expect(page.getByRole('heading', { level: 2, name: /–/ })).toBeVisible();

  // A Monday + Wednesday series, 8:00–9:00, through the Monday after.
  await page.getByRole('button', { name: 'Thêm lịch học', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Thêm lịch học' });
  await editor.getByLabel('Tiêu đề', { exact: true }).fill(session);
  await editor.getByLabel('Ngày bắt đầu', { exact: true }).fill(key(monday));
  await editor.getByLabel('Giờ bắt đầu', { exact: true }).fill('08:00');
  await editor.getByLabel('Ngày kết thúc', { exact: true }).fill(key(monday));
  await editor.getByLabel('Giờ kết thúc', { exact: true }).fill('09:00');
  await editor.getByLabel('Lặp lại hằng tuần', { exact: true }).check();
  const weekdays = editor.getByRole('group', { name: 'Lặp vào' });
  // The start day's weekday is always part of the series.
  await expect(weekdays.getByRole('checkbox', { name: 'Th 2' })).toBeChecked();
  await expect(weekdays.getByRole('checkbox', { name: 'Th 2' })).toBeDisabled();
  await weekdays.getByRole('checkbox', { name: 'Th 4' }).check();
  await editor.getByLabel('Lặp đến ngày', { exact: true }).fill(key(following));
  await editor.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Đã lưu: ${session}` })).toBeVisible();

  // Shortcuts: → moves a week; they are ignored while typing.
  await page.locator('#calendar-heading').click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#calendar-heading')).toHaveText(new RegExp(`^${short(monday)} – `));
  const block = (day: Date, name = session) =>
    column(page, day).locator('.calendar-session', { hasText: name });
  await expect(block(monday)).toHaveCount(1);
  await expect(block(wednesday)).toHaveCount(1);
  await expect(block(monday)).toHaveAttribute('title', /Lặp hằng tuần: Th 2, Th 4/);

  // "Chỉ buổi này" is the default: renaming Wednesday leaves Monday as it was.
  await block(wednesday).click();
  const edit = page.getByRole('form', { name: 'Sửa lịch học' });
  await expect(edit.getByRole('radio', { name: 'Chỉ buổi này' })).toBeChecked();
  await expect(edit.getByLabel('Lặp lại hằng tuần', { exact: true })).toHaveCount(0);
  await edit.getByLabel('Tiêu đề', { exact: true }).fill(`${session} (bù)`);
  await edit.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(block(wednesday, `${session} (bù)`)).toHaveCount(1);
  await expect(block(monday)).toHaveCount(1);
  await expect(block(monday)).not.toContainText('(bù)');

  // Deleting only Monday keeps the series going the week after.
  await block(monday).click();
  await page.getByRole('button', { name: 'Xóa buổi này', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã xóa mục lịch.' })).toBeVisible();
  await expect(block(monday)).toHaveCount(0);

  // Dragging the detached session to Thursday 9:30, held at its middle, starts it at 9:00.
  await block(wednesday, `${session} (bù)`).dragTo(column(page, thursday), {
    targetPosition: { x: 20, y: 9.5 * HOUR_PX },
  });
  await expect(
    page.getByRole('status').filter({ hasText: `Đã dời: ${session} (bù)` }),
  ).toBeVisible();
  await expect(block(thursday, `${session} (bù)`)).toContainText('9:00–10:00');
  await expect(block(wednesday, `${session} (bù)`)).toHaveCount(0);

  // An undated task dragged onto Friday 10:00 gets that due time.
  const tasks = page.getByRole('complementary', { name: 'Việc cần làm' });
  const quick = tasks.getByLabel('Thêm việc nhanh', { exact: true });
  await quick.fill(task);
  // Typing "m" in the quick-add box does not switch to the month view.
  await quick.press('m');
  await expect(page.getByRole('button', { name: 'Tuần', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await quick.fill(task);
  await tasks.getByRole('button', { name: 'Thêm', exact: true }).click();
  const entry = tasks.locator('li', { hasText: task });
  await expect(entry).toContainText('Chưa có ngày');
  await entry.dragTo(column(page, friday), { targetPosition: { x: 20, y: 10 * HOUR_PX } });
  await expect(page.getByRole('status').filter({ hasText: `Đã dời: ${task}` })).toBeVisible();
  await expect(entry).toContainText(`Hạn ${label(friday)} 10:00`);
  await expect(page.locator('.calendar-week-strip .calendar-chip', { hasText: task })).toHaveCount(
    1,
  );

  // The week after still has the series; "Cả chuỗi" shows its first session and deletes it all.
  await page.locator('#calendar-heading').click();
  await page.keyboard.press('ArrowRight');
  await expect(block(following)).toHaveCount(1);
  await block(following).click();
  const whole = page.getByRole('form', { name: 'Sửa lịch học' });
  await whole.getByRole('radio', { name: 'Cả chuỗi' }).check();
  await expect(whole.getByLabel('Ngày bắt đầu', { exact: true })).toHaveValue(key(monday));
  await expect(whole.getByLabel('Lặp lại hằng tuần', { exact: true })).toBeChecked();
  await whole.getByRole('button', { name: 'Xóa cả chuỗi', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await expect(block(following)).toHaveCount(0);

  // View shortcuts.
  await page.locator('#calendar-heading').click();
  await page.keyboard.press('m');
  await expect(page.getByRole('heading', { level: 2, name: /^Tháng \d+, \d{4}$/ })).toBeVisible();
  await page.keyboard.press('a');
  await expect(page.getByRole('button', { name: 'Lịch biểu', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('w');
  await expect(page.getByRole('button', { name: 'Tuần', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('t');
  await expect(page.locator('#calendar-heading')).toContainText(
    short(plus(today, -((today.getDay() + 6) % 7))),
  );
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
