import { expect, test } from './helpers/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { openReaderFixture, readerHeaders, readerLogin } from './helpers/reader-session';

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

/** The isolated test database, for a notice the worker would write each morning. */
async function database<T>(
  work: (db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<T>,
) {
  const environment = parseEnv(readFileSync('.local/test.env', 'utf8'));
  const url = new URL(environment.TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test')) throw new Error('Isolated test database required.');
  const { Client } = createRequire(`${process.cwd()}/apps/api/package.json`)('pg');
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    return await work(db);
  } finally {
    await db.end();
  }
}

test('keyboard review, statistics and a card export on the study page', async ({ page }) => {
  test.setTimeout(150_000);
  const run = randomUUID().slice(0, 8);
  const fixture = await openReaderFixture(page, 'study4');
  await clearCards(page);
  await addCard(page, fixture.path, `Câu nhớ ${run}`);
  await addCard(page, fixture.path, `Câu quên ${run}`);

  await page.goto('/workspace/study?on=due');
  const review = page.getByRole('region', { name: 'Ôn thẻ đến hạn' });
  await expect(review.getByText('Phím tắt: Space hiện đáp án · 1 Chưa nhớ · 2 Nhớ.')).toBeVisible();
  for (let card = 1; card <= 2; card++) {
    await expect(review.getByRole('status')).toContainText(`Thẻ ${card} / 2`);
    const question = (await review.getByRole('heading', { level: 3 }).nth(1).textContent()) ?? '';
    // Space shows the answer when focus is not on a button.
    await review.getByRole('heading', { level: 3 }).nth(1).focus();
    await page.keyboard.press('Space');
    await expect(review.getByText(`Đáp án của ${question}`, { exact: true })).toBeVisible();
    await page.keyboard.press(question.startsWith('Câu nhớ') ? '2' : '1');
  }
  await expect(review.getByRole('heading', { name: 'Xong lượt: nhớ 1 / 2 thẻ' })).toBeVisible();
  await review.getByRole('button', { name: 'Về danh sách thẻ', exact: true }).click();

  // The saved answers show up in the statistics; free practice would not.
  await page.getByText('Thống kê ôn tập', { exact: true }).click();
  const history = page.locator('.study-history');
  await expect(history).toContainText('ngày liên tiếp');
  const today = history.getByRole('row').filter({ hasText: 'Hôm nay' });
  await expect(today).toBeVisible();
  const [known, again] = await today.getByRole('cell').allTextContents();
  expect(Number(known)).toBeGreaterThanOrEqual(1);
  expect(Number(again)).toBeGreaterThanOrEqual(1);
  await expect(history).toContainText('Hộp 1: 2');

  // The cards go out as a file with their questions and answers.
  const exporter = page.getByRole('group', { name: 'Tải thẻ ôn tập' });
  const download = page.waitForEvent('download');
  await exporter.getByRole('button', { name: 'Markdown (.md)', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('the-on-tap.md');
  const text = readFileSync((await file.path())!, 'utf8');
  expect(text).toContain(`Câu nhớ ${run}`);
  expect(text).toContain(`Đáp án của Câu quên ${run}`);
  await expect(exporter.getByRole('status')).toHaveText('Đã tạo file thẻ ôn tập.');

  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('the morning reminder is chosen in settings and its notice opens the due review', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await readerLogin(page, 'student', 'study4');
  const choice = page.getByRole('combobox', { name: 'Nhắc thẻ ôn tập đến hạn', exact: true });
  const choose = async (label: string) => {
    await page.goto('/workspace/settings');
    await expect(choice).toBeVisible();
    await choice.click();
    await page.getByRole('option', { name: label, exact: true }).click();
    await page.getByRole('button', { name: 'Lưu cài đặt đọc', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Lưu cài đặt đọc', exact: true })).toBeDisabled();
  };
  try {
    await page.goto('/workspace/settings');
    await expect(choice).toContainText('Không nhắc');
    await choose('Chuông thông báo');
    await page.reload();
    await expect(choice).toContainText('Chuông thông báo');
  } finally {
    await choose('Không nhắc');
  }
  await expect(choice).toContainText('Không nhắc');

  // What the worker writes each morning, read back through the notification list.
  const me = (await (await page.request.get('/api/v1/auth/me')).json()).user.id as string;
  const key = `studydue:${Date.now()}`.slice(0, 18);
  await database((db) =>
    db.query(
      `INSERT INTO hucescholar.notifications(user_id,kind,event_key,title,detail)
       VALUES ($1,'STUDY_CARDS_DUE',$2,'Thẻ ôn tập đến hạn','3')`,
      [me, key],
    ),
  );
  try {
    await page.goto('/workspace/notifications');
    const item = page.getByRole('listitem').filter({ hasText: 'Hôm nay có 3 thẻ ôn tập đến hạn.' });
    await expect(item).toBeVisible();
    await item.getByRole('link', { name: 'Ôn thẻ đến hạn', exact: true }).click();
    await expect(page).toHaveURL('/workspace/study?on=due');
  } finally {
    await database((db) =>
      db.query('DELETE FROM hucescholar.notifications WHERE user_id=$1 AND event_key=$2', [
        me,
        key,
      ]),
    );
  }
});
