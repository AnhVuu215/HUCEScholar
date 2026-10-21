import { expect, test, type Page } from './helpers/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { readerHeaders, readerLogin, readerLogout } from './helpers/reader-session';
import { readerPdf } from './helpers/reader-pdf';

/** Synthetic scan verdict in the isolated test DB; the worker's own notice is covered by integration tests. */
async function markSafe(documentId: string) {
  const environment = parseEnv(readFileSync('.local/test.env', 'utf8'));
  const url = new URL(environment.TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test')) throw new Error('Isolated test database required.');
  const { Client } = createRequire(`${process.cwd()}/apps/api/package.json`)('pg');
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    await db.query(
      "UPDATE hucescholar.files SET scan_status='SAFE',checked_at=now(),page_count=2,has_text_layer=true WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE document_id=$1)",
      [documentId],
    );
  } finally {
    await db.end();
  }
}

/** A student draft sent back by an admin through the real decision API, which writes the notice. */
async function changesRequested(page: Page) {
  const code = `NT1-${randomBytes(5).toString('hex').toUpperCase()}`;
  await readerLogin(page, 'admin', 'notify');
  let headers = await readerHeaders(page);
  const faculty = await page.request.post('/api/v1/admin/catalog/faculties', {
    headers,
    data: { code, name: 'Khoa kiểm thử thông báo' },
  });
  const course = await page.request.post('/api/v1/admin/catalog/courses', {
    headers,
    data: { code, name: 'Môn kiểm thử thông báo', facultyId: (await faculty.json()).item.id },
  });
  expect(course.status()).toBe(201);
  await readerLogout(page);
  await readerLogin(page, 'student', 'notify');
  headers = await readerHeaders(page);
  const title = `Tài liệu cần sửa ${code}`;
  const draft = await page.request.post('/api/v1/material-drafts', {
    headers,
    data: {
      title,
      authors: 'Tác giả minh họa',
      description: 'Bản nháp cho kiểm thử thông báo.',
      materialType: 'EXERCISE',
      sourceReference: 'Tự biên soạn — minh họa',
      rightsBasis: 'Tác giả cho phép — minh họa',
      downloadAllowed: false,
      courseIds: [(await course.json()).item.id],
    },
  });
  const id = (await draft.json()).item.id as string;
  const upload = await page.request.post(`/api/v1/material-drafts/${id}/pdf`, {
    headers: {
      ...headers,
      'Content-Type': 'application/pdf',
      'X-File-Name': 'thong-bao.pdf',
      'If-Match': '"1"',
    },
    data: readerPdf(),
  });
  expect(upload.status()).toBe(201);
  await markSafe(id);
  expect(
    (
      await page.request.post(`/api/v1/material-drafts/${id}/submit`, {
        headers,
        data: { revision: 2 },
      })
    ).status(),
  ).toBe(201);
  await readerLogout(page);
  await readerLogin(page, 'admin', 'notify');
  headers = await readerHeaders(page);
  const request = (
    await (
      await page.request.get(
        `/api/v1/admin/publication-requests?search=${encodeURIComponent(code)}`,
      )
    ).json()
  ).items[0];
  const decided = await page.request.post(
    `/api/v1/admin/publication-requests/${request.id}/decision`,
    {
      headers,
      data: {
        revision: request.revision,
        submittedRevision: request.submittedRevision,
        outcome: 'CHANGES_REQUIRED',
        reason: 'Bổ sung nguồn trích dẫn — lý do riêng của admin',
      },
    },
  );
  expect(decided.status()).toBe(201);
  await readerLogout(page);
  await readerLogin(page, 'student', 'notify');
  return { title };
}

test('a review decision reaches the submitter in the header and opens the draft', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { title } = await changesRequested(page);
  await page.goto('/workspace/student');
  const bell = page.getByRole('link', { name: /^Thông báo, \d+ chưa đọc$/ });
  await expect(bell).toBeVisible({ timeout: 15_000 });
  await bell.click();
  await expect(page).toHaveURL('/workspace/notifications');
  const item = page.getByRole('listitem').filter({ hasText: title });
  await expect(item).toContainText('cần chỉnh sửa trước khi duyệt');
  // The admin's own wording stays on the draft, not in the notice.
  await expect(item).not.toContainText('lý do riêng của admin');
  await expect(item).toContainText('Chưa đọc');
  await item.getByRole('link', { name: 'Mở bản nháp', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\/student\/materials\?draft=\d+$/);
  await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toHaveValue(title);
  await page.goto('/workspace/notifications');
  await expect(page.getByRole('listitem').filter({ hasText: title })).toContainText('Đã đọc');
});

test('mark all read clears the count and the unread filter', async ({ page }) => {
  test.setTimeout(90_000);
  const { title } = await changesRequested(page);
  await page.goto('/workspace/notifications');
  await page.getByRole('button', { name: 'Chỉ chưa đọc', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible();
  await page.getByRole('button', { name: 'Đánh dấu tất cả đã đọc', exact: true }).click();
  await expect(page.getByText('Đã đánh dấu tất cả là đã đọc.')).toBeVisible();
  await expect(page.getByText('Không có thông báo chưa đọc.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Thông báo', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole('button', { name: 'Xem tất cả', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
