import { expect, test } from './helpers/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { openReaderFixture } from './helpers/reader-session';

/** The worker is not part of this run, so the page text it would extract is written directly. */
async function indexFixture(versionId: string, pages: string[]) {
  const url = new URL(parseEnv(readFileSync('.local/test.env', 'utf8')).TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test')) throw new Error('Isolated test database required.');
  const { Client } = createRequire(`${process.cwd()}/apps/api/package.json`)('pg');
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    const { rows } = await db.query(
      'SELECT file_id FROM hucescholar.document_versions WHERE id=$1',
      [versionId],
    );
    await db.query(
      'INSERT INTO hucescholar.file_text(file_id,pages,indexed_at) VALUES($1,$2,now())',
      [rows[0].file_id, pages.length],
    );
    for (const [index, content] of pages.entries())
      await db.query(
        'INSERT INTO hucescholar.file_pages(file_id,page_number,content,folded) VALUES($1,$2,$3,lower($3))',
        [rows[0].file_id, index + 1, content],
      );
  } finally {
    await db.end();
  }
}

test('a word inside a PDF finds the document and opens its page with the match selected', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const fixture = await openReaderFixture(page, 'search4');
  await indexFixture(fixture.versionId, [
    'HUCEScholar reader fixture - page one',
    'Second page - study material',
  ]);
  const { item } = await (await page.request.get(fixture.path)).json();

  await page.goto('/workspace/library');
  await page.getByLabel('Tìm học liệu', { exact: true }).fill('STUDY MATERIAL');
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();

  // The newest match comes first, so this run's document is on the first page of results.
  const link = page.getByRole('link', { name: `Đọc ${item.title}`, exact: true });
  await expect(link).toHaveText('Mở trang 2');
  const result = page.locator('.library-list > li').filter({ has: link });
  await expect(result.locator('.library-match')).toContainText('Trang 2:');
  await expect(result.locator('mark')).toHaveText('study material');

  await link.click();
  await expect(page).toHaveURL(
    `/workspace/library/versions/${fixture.versionId}?page=2&find=study+material`,
  );
  await expect(page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' })).toBeVisible(
    {
      timeout: 30_000,
    },
  );
  const find = page.getByRole('region', { name: 'Tìm chữ trong PDF' });
  await expect(find.getByLabel('Chữ cần tìm trong PDF')).toHaveValue('study material');
  await expect(find).toContainText('1 / 1');
});
