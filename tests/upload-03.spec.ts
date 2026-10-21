import { expect, test, type Page } from './helpers/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import {
  openReaderFixture,
  readerHeaders,
  readerLogin,
  readerLogout,
} from './helpers/reader-session';
import { readerPdf } from './helpers/reader-pdf';

/** Synthetic worker verdict in the isolated test DB; the real scan path is covered by unit/integration tests. */
async function failWith(documentId: string, reason: string) {
  const environment = parseEnv(readFileSync('.local/test.env', 'utf8'));
  const url = new URL(environment.TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test')) throw new Error('Isolated test database required.');
  const { Client } = createRequire(`${process.cwd()}/apps/api/package.json`)('pg');
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    await db.query(
      "UPDATE hucescholar.files SET scan_status='FAILED',check_error=$2,checked_at=now() WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE document_id=$1)",
      [documentId, reason],
    );
  } finally {
    await db.end();
  }
}

async function draftWithPdf(page: Page) {
  const code = `UP3-${randomBytes(5).toString('hex').toUpperCase()}`;
  await readerLogin(page, 'admin', 'upload3');
  let headers = await readerHeaders(page);
  const faculty = await page.request.post('/api/v1/admin/catalog/faculties', {
    headers,
    data: { code, name: 'Khoa kiểm thử lý do' },
  });
  const course = await page.request.post('/api/v1/admin/catalog/courses', {
    headers,
    data: { code, name: 'Môn kiểm thử lý do', facultyId: (await faculty.json()).item.id },
  });
  expect(course.status()).toBe(201);
  await readerLogout(page);
  await readerLogin(page, 'student', 'upload3');
  headers = await readerHeaders(page);
  const title = `Tài liệu bị từ chối ${code}`;
  const draft = await page.request.post('/api/v1/material-drafts', {
    headers,
    data: {
      title,
      authors: 'Tác giả minh họa',
      description: 'PDF không đạt kiểm tra.',
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
      'X-File-Name': 'bi-tu-choi.pdf',
      'If-Match': '"1"',
    },
    data: readerPdf(),
  });
  expect(upload.status()).toBe(201);
  return { id, title };
}

test('a failed PDF says why, so the uploader knows what to fix', async ({ page }) => {
  test.setTimeout(60_000);
  const { id, title } = await draftWithPdf(page);
  await failWith(id, 'PASSWORD_PROTECTED');
  await page.goto('/workspace/student/materials');
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: title })
      .getByText('PDF không đạt kiểm tra: PDF có mật khẩu'),
  ).toBeVisible();
  await page.getByRole('button', { name: `Mở bản nháp ${title}`, exact: true }).click();
  const pdf = page.getByRole('region', { name: 'PDF của bản nháp' });
  await expect(pdf.getByText('PDF đang đặt mật khẩu để mở', { exact: false })).toBeVisible();
  await expect(pdf.getByText('Đang kiểm tra', { exact: false })).toHaveCount(0);
  // The admin lifecycle screen names the same reason.
  await readerLogout(page);
  await readerLogin(page, 'admin', 'upload3');
  await page.goto('/workspace/admin/materials');
  await page.getByLabel('Tìm tài liệu quản lý', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page.getByRole('button', { name: `Quản lý ${title}`, exact: true }).click();
  await expect(
    page.getByText('PDF không đạt kiểm tra: PDF có mật khẩu', { exact: false }),
  ).toBeVisible();
});

test('a copy-restricted PDF can be read and page-noted but not highlighted or cited', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openReaderFixture(page, 'upload3', { copyRestricted: true });
  await expect(page.getByText('PDF này cấm sao chép nội dung', { exact: false })).toBeVisible();
  const text = page
    .locator('.textLayer span')
    .filter({ hasText: 'HUCEScholar reader fixture' })
    .first();
  await text.scrollIntoViewIfNeeded();
  const box = (await text.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 15 });
  await page.mouse.up();
  for (const name of ['Tô sáng đoạn chọn', 'Ghi chú đoạn chọn', 'Trích dẫn đoạn chọn'])
    await expect(page.getByRole('button', { name, exact: true }).first()).toBeDisabled();
  await page.getByRole('tab', { name: 'Ghi chú trang', exact: true }).click();
  const content = page.getByLabel('Nội dung ghi chú', { exact: true });
  await content.fill('Ghi chú trang trên PDF cấm sao chép');
  await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
  await expect(content).toHaveValue('', { timeout: 15_000 });
});
