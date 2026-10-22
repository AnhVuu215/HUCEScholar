import { expect, test } from './helpers/test';
import { openReaderFixture } from './helpers/reader-session';

test('reading is scheduled from the reader and the calendar manages sessions and tasks', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const fixture = await openReaderFixture(page, 'cal1');
  await page.getByRole('button', { name: 'Lên lịch đọc', exact: true }).click();
  const schedule = page.getByRole('form', { name: 'Lên lịch đọc' });
  await expect(schedule.getByLabel('Ngày', { exact: true })).not.toHaveValue('');
  await schedule.getByLabel('Giờ bắt đầu', { exact: true }).fill('19:00');
  await schedule.getByRole('button', { name: 'Thêm vào lịch', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã thêm buổi đọc' })).toBeVisible();
  await page.getByRole('link', { name: 'Xem lịch học', exact: true }).click();

  await expect(page).toHaveURL('/workspace/calendar');
  await expect(page.getByRole('link', { name: 'Lịch học', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  // The reading session is tomorrow, so the agenda (today + 30 days) always contains it.
  await page.getByRole('button', { name: 'Lịch biểu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lịch biểu', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: /^Đọc: / })).toBeVisible();
  await expect(page.getByRole('link', { name: /· trang 1$/ })).toHaveAttribute(
    'href',
    `${fixture.route}?page=1`,
  );

  // Quick add makes an undated task; ticking it removes it from the open list.
  const tasks = page.getByRole('complementary', { name: 'Việc cần làm' });
  await tasks.getByLabel('Thêm việc nhanh', { exact: true }).fill('Nộp báo cáo thí nghiệm');
  await tasks.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(tasks.getByText('Chưa có ngày')).toBeVisible();
  await tasks.getByRole('checkbox', { name: 'Hoàn thành: Nộp báo cáo thí nghiệm' }).check();
  await expect(page.getByRole('status').filter({ hasText: 'Đã xong' })).toBeVisible();
  await expect(tasks.getByRole('button', { name: 'Nộp báo cáo thí nghiệm' })).toHaveCount(0);

  // A session made from the toolbar shows in the week grid; edit then delete it.
  await page.getByRole('button', { name: 'Tuần', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm lịch học', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Thêm lịch học' });
  await expect(editor.getByLabel('Tiêu đề', { exact: true })).toBeFocused();
  await editor.getByLabel('Tiêu đề', { exact: true }).fill('Ôn tập nhóm');
  await editor.getByRole('radio', { name: 'Tím' }).check();
  await editor.getByRole('button', { name: 'Lưu', exact: true }).click();
  const session = page.locator('.calendar-session', { hasText: 'Ôn tập nhóm' });
  await expect(session).toBeVisible();
  await expect(session).toHaveClass(/calendar-color-purple/);
  await session.click();
  const edit = page.getByRole('form', { name: 'Sửa lịch học' });
  await edit.getByLabel('Tiêu đề', { exact: true }).fill('Ôn tập nhóm (đổi giờ)');
  await edit.getByRole('button', { name: 'Lưu', exact: true }).click();
  const renamed = page.locator('.calendar-session', { hasText: 'Ôn tập nhóm (đổi giờ)' });
  await expect(renamed).toBeVisible();
  await renamed.click();
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã xóa mục lịch.' })).toBeVisible();
  await expect(renamed).toHaveCount(0);

  await page.getByRole('button', { name: 'Tháng', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: /^Tháng \d+, \d{4}$/ })).toBeVisible();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
