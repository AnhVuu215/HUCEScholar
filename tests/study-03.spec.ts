import { expect, test } from './helpers/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { openReaderFixture, readerHeaders } from './helpers/reader-session';

async function addCard(page: Page, path: string, question: string) {
  const headers = await readerHeaders(page);
  const highlight = await page.request.post(`${path}/highlights`, {
    headers,
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
  expect(highlight.status()).toBe(201);
  const card = await page.request.post(`${path}/study-cards`, {
    headers,
    data: {
      annotationId: (await highlight.json()).item.id,
      question,
      answer: `Đáp án của ${question}`,
      requestId: randomUUID(),
    },
  });
  expect(card.status()).toBe(201);
}

/** The account keeps its cards between runs, and this test counts them. */
async function clearCards(page: Page) {
  const headers = await readerHeaders(page);
  const { items } = await (await page.request.get('/api/v1/study-cards?limit=50')).json();
  for (const card of items as { id: string; revision: number }[])
    expect(
      (
        await page.request.delete(`/api/v1/study-cards/${card.id}`, {
          headers,
          data: { revision: card.revision },
        })
      ).status(),
    ).toBe(204);
}

test('a due review saves each answer once, sets the next date and reaches home and the calendar', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const run = randomUUID().slice(0, 8);
  const fixture = await openReaderFixture(page, 'study3');
  await clearCards(page);
  await addCard(page, fixture.path, `Câu nhớ ${run}`);
  await addCard(page, fixture.path, `Câu quên ${run}`);

  // Home leads straight into the review.
  await page.goto('/workspace/student');
  await page.getByRole('link', { name: 'Ôn 2 thẻ đến hạn', exact: true }).click();
  await expect(page).toHaveURL('/workspace/study?on=due');
  const review = page.getByRole('region', { name: 'Ôn thẻ đến hạn' });
  await expect(review.getByRole('status')).toContainText('Thẻ 1 / 2');

  const reveal = () => review.getByRole('button', { name: 'Hiện đáp án', exact: true }).click();
  const heading = () => review.getByRole('heading', { level: 3 }).nth(1);
  const answerFor = async (text: string | null) =>
    review.getByRole('button', {
      name: text?.startsWith('Câu nhớ') ? 'Nhớ' : 'Chưa nhớ',
      exact: true,
    });

  // A failed save keeps the card on screen; the retry goes through.
  await reveal();
  const first = await heading().textContent();
  await page.route('**/api/v1/study-cards/*/review', (route) => route.abort(), { times: 1 });
  await (await answerFor(first)).click();
  await expect(review.getByRole('alert')).toBeVisible();
  await expect(review.getByRole('status')).toContainText('Thẻ 1 / 2');
  await (await answerFor(first)).click();
  await expect(review.getByRole('status')).toContainText('Thẻ 2 / 2');

  await reveal();
  await (await answerFor(await heading().textContent())).click();
  await expect(review.getByRole('heading', { name: 'Xong lượt: nhớ 1 / 2 thẻ' })).toBeFocused();
  await expect(review.getByText(/^Đã lưu lịch ôn/)).toBeVisible();

  // Going over the forgotten card again is practice: nothing more is saved.
  let saved = 0;
  await page.route('**/api/v1/study-cards/*/review', (route) => {
    saved++;
    return route.continue();
  });
  await review.getByRole('button', { name: 'Ôn lại 1 thẻ chưa nhớ', exact: true }).click();
  await expect(review.getByText('Lượt này chỉ để luyện, không đổi lịch ôn.')).toBeVisible();
  await reveal();
  await review.getByRole('button', { name: 'Nhớ', exact: true }).click();
  expect(saved).toBe(0);
  await page.unroute('**/api/v1/study-cards/*/review');
  await review.getByRole('button', { name: 'Về danh sách thẻ', exact: true }).click();

  // Both cards moved to tomorrow, and nothing is due today.
  await expect(
    page.getByText(/^Hôm nay không có thẻ đến hạn\. Lần ôn tiếp theo: .* \(2 thẻ\)\.$/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ôn \d+ thẻ đến hạn$/ })).toHaveCount(0);
  const remembered = page.getByRole('article', { name: `Câu nhớ ${run}` });
  await expect(remembered.getByText(/^Ôn lại ngày .* · Hộp 1\/6$/)).toBeVisible();

  await page.goto('/workspace/calendar');
  await page.getByRole('button', { name: 'Lịch biểu', exact: true }).click();
  await expect(page.getByRole('link', { name: '2 thẻ đến hạn ôn', exact: true })).toHaveAttribute(
    'href',
    '/workspace/study',
  );

  // Starting a card over makes it due today, and the calendar's chip opens the review.
  await page.goto('/workspace/study');
  await page
    .getByRole('article', { name: `Câu nhớ ${run}` })
    .getByRole('button', { name: 'Ôn lại từ đầu', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Ôn 1 thẻ đến hạn', exact: true })).toBeVisible();
  await expect(
    page.getByRole('article', { name: `Câu nhớ ${run}` }).getByText('Đến hạn ôn · Thẻ mới'),
  ).toBeVisible();
  await page.goto('/workspace/calendar');
  await page.getByRole('button', { name: 'Lịch biểu', exact: true }).click();
  await page.getByRole('link', { name: '1 thẻ đến hạn ôn', exact: true }).first().click();
  await expect(page.getByRole('region', { name: 'Ôn thẻ đến hạn' })).toBeVisible();
});
