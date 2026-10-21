import { expect, test } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { openReaderFixture, readerHeaders } from './helpers/reader-session';

test('a highlight becomes a private review card that can be flipped, edited and deleted', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const fixture = await openReaderFixture(page, 'study');
  const created = await page.request.post(`${fixture.path}/highlights`, {
    headers: await readerHeaders(page),
    data: {
      pageNumber: 1,
      content: '',
      color: '#FFF59D',
      requestId: randomUUID(),
      anchor: {
        coordinateSpace: 'normalized-pdf-v1',
        quote: 'HUCEScholar reader fixture',
        quads: [[0.08, 0.9, 0.5, 0.9, 0.5, 0.88, 0.08, 0.88]],
      },
    },
  });
  expect(created.status()).toBe(201);
  const highlight = (await created.json()).item;
  await page.reload();
  await page.getByRole('tab', { name: 'Đoạn tô', exact: true }).click();
  const row = page.getByRole('article', { name: `Vùng tô ${highlight.id}`, exact: true });
  await row.getByRole('button', { name: 'Tạo thẻ ôn tập', exact: true }).click();
  const form = row.getByRole('form', { name: 'Tạo thẻ ôn tập' });
  await form.getByLabel('Câu hỏi', { exact: true }).fill('Tài liệu kiểm thử tên là gì?');
  await form.getByLabel('Đáp án', { exact: true }).fill('HUCEScholar reader fixture');
  await form.getByRole('button', { name: 'Lưu thẻ', exact: true }).click();
  await expect(row.getByRole('status')).toContainText('Đã tạo thẻ.');
  await row.getByRole('link', { name: 'Xem thẻ ôn tập', exact: true }).click();

  await expect(page).toHaveURL('/workspace/study');
  const card = page.getByRole('article', { name: 'Tài liệu kiểm thử tên là gì?' });
  const answer = card.getByText('HUCEScholar reader fixture', { exact: true }).first();
  await expect(answer).toBeHidden();
  const flip = card.getByRole('button', { name: 'Hiện đáp án', exact: true });
  await expect(flip).toHaveAttribute('aria-expanded', 'false');
  await flip.click();
  await expect(answer).toBeVisible();
  await expect(card.getByRole('link', { name: 'Mở trang nguồn' })).toHaveAttribute(
    'href',
    `${fixture.route}?page=1`,
  );
  await card.getByRole('button', { name: 'Sửa thẻ', exact: true }).click();
  await card.getByLabel('Câu hỏi', { exact: true }).fill('Tên tài liệu kiểm thử?');
  await card.getByRole('button', { name: 'Lưu thẻ', exact: true }).click();
  const edited = page.getByRole('article', { name: 'Tên tài liệu kiểm thử?' });
  await expect(edited).toBeVisible();
  await edited.getByRole('button', { name: 'Xóa thẻ', exact: true }).click();
  await edited.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Tên tài liệu kiểm thử?' })).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
