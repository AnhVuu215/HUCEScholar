import { expect, test } from './helpers/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { openReaderFixture, readerLogin, readerLogout } from './helpers/reader-session';

type Db = { query: (sql: string, values?: unknown[]) => Promise<{ rows: { file_id: string }[] }> };

/** The worker is not part of this run, so what it would write is written directly. */
async function withTestDb<T>(run: (db: Db) => Promise<T>) {
  const url = new URL(parseEnv(readFileSync('.local/test.env', 'utf8')).TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test')) throw new Error('Isolated test database required.');
  const { Client } = createRequire(`${process.cwd()}/apps/api/package.json`)('pg');
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    return await run(db);
  } finally {
    await db.end();
  }
}
const fileOf = async (db: Db, versionId: string) =>
  (await db.query('SELECT file_id FROM hucescholar.document_versions WHERE id=$1', [versionId]))
    .rows[0].file_id;

function indexFixture(versionId: string, pages: string[]) {
  return withTestDb(async (db) => {
    const file = await fileOf(db, versionId);
    await db.query(
      'INSERT INTO hucescholar.file_text(file_id,pages,indexed_at) VALUES($1,$2,now())',
      [file, pages.length],
    );
    for (const [index, content] of pages.entries())
      await db.query(
        'INSERT INTO hucescholar.file_pages(file_id,page_number,content,folded) VALUES($1,$2,$3,lower($3))',
        [file, index + 1, content],
      );
  });
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

test('admins see a PDF whose text could not be indexed and retry it', async ({ page }) => {
  test.setTimeout(150_000);
  const fixture = await openReaderFixture(page, 'textindex');
  const { item } = await (await page.request.get(fixture.path)).json();
  await withTestDb(async (db) =>
    db.query(
      'INSERT INTO hucescholar.file_text(file_id,attempts) VALUES($1,3) ON CONFLICT (file_id) DO UPDATE SET attempts=3,indexed_at=NULL',
      [await fileOf(db, fixture.versionId)],
    ),
  );
  await readerLogout(page);
  await readerLogin(page, 'admin', 'textindex');

  // The admin home lists it and links to the filtered materials list.
  await page.goto('/workspace/admin');
  const home = page.getByRole('region', { name: 'Lập chỉ mục chữ lỗi' });
  await expect(home.getByText(item.title, { exact: true })).toBeVisible();
  await home.getByRole('link', { name: 'Xem và lập chỉ mục lại' }).click();
  await expect(page).toHaveURL('/workspace/admin/materials?textIndex=FAILED');
  await expect(page.getByLabel('Tìm trong nội dung')).toHaveValue('FAILED');
  const row = page.getByRole('row').filter({ hasText: item.title });
  await expect(row).toContainText('Lập chỉ mục chữ lỗi');

  await row.getByRole('button', { name: `Quản lý ${item.title}` }).click();
  const detail = page.getByRole('region', { name: 'Chi tiết quản lý học liệu' });
  await expect(detail).toContainText('Lập chỉ mục chữ lỗi sau 3 lần thử.');
  await detail.getByRole('button', { name: 'Lập chỉ mục lại' }).click();
  await expect(detail.getByRole('status')).toHaveText(
    'Đã yêu cầu lập chỉ mục lại. Worker sẽ thử trong khoảng một phút.',
  );
  await expect(detail).toContainText('Đang chờ lập chỉ mục chữ');
  await expect(detail.getByRole('button', { name: 'Lập chỉ mục lại' })).toHaveCount(0);
  // The list reloads without the document once it is pending again.
  await expect(page.getByRole('row').filter({ hasText: item.title })).toHaveCount(0);
});
