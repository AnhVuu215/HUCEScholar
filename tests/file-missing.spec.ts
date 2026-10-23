import { expect, test } from './helpers/test';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { openReaderFixture } from './helpers/reader-session';

/** Removes a published version's PDF bytes from the isolated test store, as a lost object would. */
async function dropPdf(versionId: string) {
  const environment = parseEnv(readFileSync('.local/test.env', 'utf8'));
  const url = new URL(environment.TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test')) throw new Error('Isolated test database required.');
  const { Client } = createRequire(`${process.cwd()}/apps/api/package.json`)('pg');
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    const { rows } = await db.query(
      'SELECT f.object_key FROM hucescholar.files f JOIN hucescholar.document_versions v ON v.file_id=f.id WHERE v.id=$1',
      [versionId],
    );
    await rm(join(process.cwd(), '.local', 'files-test', rows[0].object_key));
  } finally {
    await db.end();
  }
}

test('a version whose PDF is gone says so and offers a report, not a retry', async ({ page }) => {
  test.setTimeout(90_000);
  const { versionId } = await openReaderFixture(page, 'upload3');
  await dropPdf(versionId);
  await page.reload();
  const alert = page.getByRole('alert').filter({ hasText: 'không còn trên máy chủ' });
  await expect(alert).toBeVisible();
  await expect(page.getByText('Kiểm tra kết nối', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Thử mở lại PDF', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Báo cáo vấn đề với tài liệu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gửi báo cáo', exact: true })).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
