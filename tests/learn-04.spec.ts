import { expect, test, type Page } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { openReaderFixture, readerHeaders } from './helpers/reader-session';

const notebook = (page: Page) =>
  page.getByRole('region', { name: 'Ghi chú trên mọi tài liệu', exact: true });

test('a review session walks the filtered notes one by one, then only those marked', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const token = randomUUID().slice(0, 8);
  const fixture = await openReaderFixture(page, 'learn04');
  const headers = await readerHeaders(page);
  for (const [pageNumber, content] of [
    [1, `${token} định nghĩa`],
    [1, `${token} ví dụ`],
    [2, `${token} bài tập`],
  ] as const)
    expect(
      (
        await page.request.post(`${fixture.path}/notes`, {
          headers,
          data: { pageNumber, content, requestId: randomUUID() },
        })
      ).status(),
    ).toBe(201);
  await page.goto('/workspace/notebook');
  await notebook(page).getByLabel('Tìm trong ghi chú', { exact: true }).fill(token);
  await notebook(page).getByRole('button', { name: 'Tìm ghi chú', exact: true }).click();
  await expect(notebook(page).getByRole('article')).toHaveCount(3);
  await notebook(page)
    .getByRole('button', { name: 'Ôn lần lượt theo bộ lọc đang xem', exact: true })
    .click();

  const session = page.getByRole('region', { name: 'Buổi ôn tập', exact: true });
  const entry = session.getByRole('article');
  // Document and page order, as in the notebook; the heading takes focus on each step.
  for (const [n, text] of [
    [1, 'định nghĩa'],
    [2, 'ví dụ'],
    [3, 'bài tập'],
  ] as const) {
    await expect(entry).toHaveAccessibleName(`Mục ${n} / 3`);
    await expect(entry).toContainText(`${token} ${text}`);
    await expect(entry.getByRole('heading')).toBeFocused();
    if (n === 2) {
      await entry.getByRole('button', { name: 'Đánh dấu cần xem lại', exact: true }).click();
      await expect(entry).toContainText('Cần xem lại');
      // Back and forth keeps the saved mark.
      await entry.getByRole('button', { name: 'Mục trước', exact: true }).click();
      await expect(entry).toContainText(`${token} định nghĩa`);
      await entry.getByRole('button', { name: 'Đã xem, mục tiếp', exact: true }).click();
      await expect(entry.getByRole('button', { name: 'Bỏ dấu cần xem lại' })).toBeVisible();
    }
    await entry
      .getByRole('button', { name: n === 3 ? 'Đã xem, kết thúc' : 'Đã xem, mục tiếp', exact: true })
      .click();
  }
  await expect(session.getByRole('heading', { name: 'Đã xem hết 3 mục' })).toBeFocused();
  await expect(session).toContainText('1 mục đang đánh dấu cần xem lại.');
  await session.getByRole('button', { name: 'Ôn lại 1 mục cần xem lại', exact: true }).click();
  await expect(entry).toHaveAccessibleName('Mục 1 / 1');
  await expect(entry).toContainText(`${token} ví dụ`);
  await expect(entry.getByRole('button', { name: 'Mục trước', exact: true })).toBeDisabled();
  await expect(entry.getByRole('link', { name: 'Mở trang 1', exact: true })).toHaveAttribute(
    'href',
    `${fixture.route}?page=1`,
  );
  await entry.getByRole('button', { name: 'Bỏ dấu cần xem lại', exact: true }).click();
  await expect(entry.getByRole('button', { name: 'Đánh dấu cần xem lại' })).toBeVisible();
  await entry.getByRole('button', { name: 'Đã xem, kết thúc', exact: true }).click();
  await expect(session).toContainText('Không còn mục nào đánh dấu cần xem lại trong buổi này.');
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // Leaving the session reloads the list, which shows the marks as saved.
  await session.getByRole('button', { name: 'Về sổ tay', exact: true }).click();
  await expect(notebook(page).getByRole('article')).toHaveCount(3);
  await expect(notebook(page).locator('.review-later-tag')).toHaveCount(0);
  // A failed load says so and retries in place.
  await page.route('**/notebook/search', (route) => route.abort('timedout'), { times: 1 });
  await notebook(page)
    .getByRole('button', { name: 'Ôn lần lượt theo bộ lọc đang xem', exact: true })
    .click();
  await expect(notebook(page).getByRole('alert')).toContainText('Chưa tải được các mục để ôn.');
  await notebook(page).getByRole('button', { name: 'Thử tải lại', exact: true }).click();
  await expect(entry).toHaveAccessibleName('Mục 1 / 3');
});
