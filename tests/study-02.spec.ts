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

test('a practice round goes card by card, then repeats only the cards not yet remembered', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const run = randomUUID().slice(0, 8);
  const other = await openReaderFixture(page, 'study2');
  await addCard(page, other.path, `Thẻ khác ${run}`);
  const fixture = await openReaderFixture(page, 'study2');
  for (const n of [1, 2, 3]) await addCard(page, fixture.path, `Câu ${n} ${run}`);
  const filters = await (await page.request.get('/api/v1/study-cards/filters')).json();
  const title = filters.documents.find(
    (d: { versionId: string }) => d.versionId === fixture.versionId,
  ).title;

  await page.goto('/workspace/study');
  await page.getByRole('combobox', { name: 'Tài liệu', exact: true }).click();
  await page.getByRole('option', { name: `${title} (3 thẻ)`, exact: true }).click();
  await expect(page.locator('.study-cards article')).toHaveCount(3);
  await expect(page.getByRole('article', { name: `Thẻ khác ${run}` })).toHaveCount(0);
  await page.getByRole('button', { name: 'Luyện 3 thẻ đang lọc', exact: true }).click();

  const practice = page.getByRole('region', { name: 'Luyện thẻ' });
  const seen: string[] = [];
  for (const n of [1, 2, 3]) {
    await expect(practice.getByRole('status')).toContainText(`Thẻ ${n} / 3`);
    const question = practice.getByRole('heading', { level: 3 }).nth(1);
    await expect(question).toBeFocused();
    seen.push((await question.textContent())!);
    await expect(practice.getByText(/^Đáp án của /)).toHaveCount(0);
    await practice.getByRole('button', { name: 'Hiện đáp án', exact: true }).click();
    await expect(practice.getByText(`Đáp án của ${seen.at(-1)}`, { exact: true })).toBeVisible();
    const known = practice.getByRole('button', { name: 'Nhớ', exact: true });
    await expect(known).toBeFocused();
    await (
      n === 1 ? known : practice.getByRole('button', { name: 'Chưa nhớ', exact: true })
    ).click();
  }
  // Each card came up once, and only this document's cards.
  expect([...seen].sort()).toEqual([`Câu 1 ${run}`, `Câu 2 ${run}`, `Câu 3 ${run}`]);
  const summary = practice.getByRole('heading', { name: 'Xong lượt: nhớ 1 / 3 thẻ' });
  await expect(summary).toBeFocused();
  await practice.getByRole('button', { name: 'Ôn lại 2 thẻ chưa nhớ', exact: true }).click();
  const again: string[] = [];
  for (const n of [1, 2]) {
    await expect(practice.getByRole('status')).toContainText(`Thẻ ${n} / 2`);
    again.push((await practice.getByRole('heading', { level: 3 }).nth(1).textContent())!);
    await practice.getByRole('button', { name: 'Hiện đáp án', exact: true }).click();
    await practice.getByRole('button', { name: 'Nhớ', exact: true }).click();
  }
  expect(again.sort()).toEqual(seen.slice(1).sort());
  await expect(practice.getByRole('heading', { name: 'Xong lượt: nhớ 2 / 2 thẻ' })).toBeVisible();
  await expect(practice.getByText('Bạn đã nhớ hết các thẻ trong lượt này.')).toBeVisible();

  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await practice.getByRole('button', { name: 'Về danh sách thẻ', exact: true }).click();
  await expect(page.locator('.study-cards article')).toHaveCount(3);
});
