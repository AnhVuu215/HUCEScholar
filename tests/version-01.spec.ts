import { expect, test } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { openReaderFixture, readerHeaders } from './helpers/reader-session';

/** Publishes version 2 of the fixture's document directly in the isolated test database. */
async function publishNextVersion(versionId: string) {
  const url = new URL(parseEnv(readFileSync('.local/test.env', 'utf8')).TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test')) throw new Error('Isolated test database required.');
  const { Client } = createRequire(`${process.cwd()}/apps/api/package.json`)('pg');
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    const next = (
      await db.query(
        "INSERT INTO hucescholar.document_versions(document_id,version_no,file_id,created_by,title,authors,material_type,source_reference,rights_basis,review_status) SELECT document_id,2,file_id,created_by,'Bản cập nhật kiểm thử',authors,material_type,source_reference,rights_basis,'APPROVED' FROM hucescholar.document_versions WHERE id=$1 RETURNING id, document_id",
        [versionId],
      )
    ).rows[0];
    await db.query('UPDATE hucescholar.documents SET current_version_id=$1 WHERE id=$2', [
      next.id,
      next.document_id,
    ]);
    return String(next.id);
  } finally {
    await db.end();
  }
}

test('an earlier version links to the current one while its notes stay where they were written', async ({
  page,
}) => {
  const fixture = await openReaderFixture(page, 'version01');
  const headers = await readerHeaders(page);
  expect(
    (
      await page.request.post(`${fixture.path}/notes`, {
        headers,
        data: { pageNumber: 1, content: 'Ghi chú ở phiên bản 1', requestId: randomUUID() },
      })
    ).status(),
  ).toBe(201);
  // The reader saves page 1 on its own right after opening; read the revision after that save.
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu tiến độ · Trang 1' }),
  ).toBeVisible();
  const progress = await (await page.request.get(`${fixture.path}/progress`)).json();
  expect(
    (
      await page.request.put(`${fixture.path}/progress`, {
        headers,
        data: { pageNumber: 2, revision: progress.item?.revision ?? 0 },
      })
    ).status(),
  ).toBe(200);
  const title: string = (await (await page.request.get(fixture.path)).json()).item.title;
  const current = await publishNextVersion(fixture.versionId);

  await page.goto(`${fixture.route}?page=1`);
  const notice = page.getByRole('complementary', { name: 'Phiên bản hiện hành', exact: true });
  await expect(notice).toContainText('Bạn đang đọc phiên bản 1, là bản công bố trước.');
  await expect(notice).toContainText('Bản hiện hành là phiên bản 2: Bản cập nhật kiểm thử.');
  await expect(notice).toContainText('không tự chuyển sang bản hiện hành');
  await expect(page.getByText('Ghi chú ở phiên bản 1', { exact: true })).toBeVisible();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await notice.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await notice.screenshot({ path: `.local/version-notice-${width}.png` });
  }

  await notice.getByRole('link', { name: 'Mở phiên bản 2', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/workspace/library/versions/${current}`));
  await expect(page.getByRole('heading', { name: 'Bản cập nhật kiểm thử' })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
  ).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Phiên bản hiện hành', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Ghi chú ở phiên bản 1', { exact: true })).toHaveCount(0);

  // "Đọc gần đây" keeps the version actually read and offers the current one beside it.
  await page.goto('/workspace/personal-library');
  await page.getByRole('button', { name: 'Đọc gần đây', exact: true }).click();
  const entry = page
    .getByRole('article', { name: title, exact: true })
    .filter({ hasText: 'Bản công bố trước' });
  await expect(entry).toContainText('Đã có phiên bản 2; ghi chú của bạn vẫn ở phiên bản 1.');
  await entry.getByRole('link', { name: 'Mở phiên bản 2', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/workspace/library/versions/${current}`));
});
