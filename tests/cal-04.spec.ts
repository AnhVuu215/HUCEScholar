import { expect, test } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { openReaderFixture, readerHeaders } from './helpers/reader-session';

test('a "cần xem lại" mark shows on the calendar and books a review session at its page', async ({
  page,
}) => {
  test.setTimeout(90_000);
  // Unique text keeps a retry from matching what an earlier attempt left behind.
  const content = `Chưa hiểu định lý ${randomUUID().slice(0, 8)}`;
  const fixture = await openReaderFixture(page, 'cal4');
  const headers = await readerHeaders(page);
  const note = await page.request.post(`${fixture.path}/notes`, {
    headers,
    data: { pageNumber: 2, content, requestId: randomUUID() },
  });
  expect(note.status()).toBe(201);
  const noteId = (await note.json()).item.id as string;
  const mark = async (reviewLater: boolean) =>
    expect(
      (
        await page.request.put(`${fixture.path}/annotations/${noteId}/review-later`, {
          headers,
          data: { reviewLater },
        })
      ).status(),
    ).toBe(200);
  await mark(true);

  await page.goto('/workspace/calendar');
  const panel = page.getByRole('complementary', { name: 'Cần xem lại' });
  const entry = panel.getByRole('listitem').filter({ hasText: content });
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('Tài liệu kiểm thử');
  await expect(entry).toContainText('Ghi chú · Trang 2');
  await expect(entry.getByRole('link', { name: 'Mở trang 2', exact: true })).toHaveAttribute(
    'href',
    `${fixture.route}?page=2`,
  );

  await entry.getByRole('button', { name: 'Lên lịch ôn', exact: true }).click();
  const form = entry.getByRole('form', { name: 'Lên lịch ôn' });
  await expect(form).toContainText('Buổi ôn sẽ mở lại tài liệu này ở trang 2.');
  await expect(form.getByLabel('Ngày', { exact: true })).not.toHaveValue('');
  await form.getByLabel('Giờ bắt đầu', { exact: true }).fill('20:00');
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await form.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await form.getByRole('button', { name: 'Thêm vào lịch', exact: true }).click();
  await expect(entry.getByRole('status')).toHaveText('Đã thêm buổi ôn vào lịch.');
  // Already on the calendar: it refreshes instead of linking to itself.
  await expect(entry.getByRole('link', { name: 'Xem lịch học' })).toHaveCount(0);

  // The session is tomorrow, so the agenda (today + 30 days) always contains it.
  await page.getByRole('button', { name: 'Lịch biểu', exact: true }).click();
  const session = page
    .locator('.calendar-agenda li')
    .filter({ has: page.locator(`a[href="${fixture.route}?page=2"]`) });
  await expect(session).toHaveCount(1);
  await expect(
    session.getByRole('button', { name: /^Ôn: Tài liệu kiểm thử .* \(trang 2\)$/ }),
  ).toBeVisible();
  await expect(session).toHaveClass(/calendar-color-orange/);

  // Unmarked notes leave the panel; the booked session stays.
  await mark(false);
  await page.reload();
  await expect(panel.getByRole('heading', { name: 'Cần xem lại' })).toBeVisible();
  await expect(panel.getByRole('listitem').filter({ hasText: content })).toHaveCount(0);
  await page.getByRole('button', { name: 'Lịch biểu', exact: true }).click();
  await expect(session).toHaveCount(1);
});
