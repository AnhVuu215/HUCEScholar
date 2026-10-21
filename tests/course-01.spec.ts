import { expect, test, type Page } from './helpers/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { readerHeaders, readerLogout } from './helpers/reader-session';
import { readerPdf } from './helpers/reader-pdf';

async function login(page: Page, role: 'admin' | 'lecturer' | 'student') {
  const response = await page.request.post('/api/v1/auth/login', {
    headers: await readerHeaders(page),
    data: { email: `e2e-course1-${role}@example.test`, password: process.env.E2E_PASSWORD! },
  });
  expect(response.status()).toBe(200);
}
/** Synthetic scan verdict in the isolated test DB. */
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

/** A course with an assigned lecturer and two published materials. */
async function courseWithMaterials(page: Page) {
  const code = `CL1-${randomBytes(5).toString('hex').toUpperCase()}`;
  await login(page, 'admin');
  let headers = await readerHeaders(page);
  const faculty = await page.request.post('/api/v1/admin/catalog/faculties', {
    headers,
    data: { code, name: 'Khoa kiểm thử danh sách đọc' },
  });
  const course = await page.request.post('/api/v1/admin/catalog/courses', {
    headers,
    data: { code, name: 'Môn có danh sách đọc', facultyId: (await faculty.json()).item.id },
  });
  expect(course.status()).toBe(201);
  const courseId = (await course.json()).item.id as string;
  const lecturer = (
    await (
      await page.request.get(
        `/api/v1/admin/users?search=${encodeURIComponent('e2e-course1-lecturer@example.test')}`,
      )
    ).json()
  ).items[0];
  expect(
    (
      await page.request.post('/api/v1/admin/assignments', {
        headers,
        data: { courseId, lecturerId: lecturer.id },
      })
    ).status(),
  ).toBe(201);
  await readerLogout(page);
  await login(page, 'student');
  headers = await readerHeaders(page);
  const titles = [`Giáo trình chương 1 ${code}`, `Bài tập chương 2 ${code}`];
  for (const title of titles) {
    const draft = await page.request.post('/api/v1/material-drafts', {
      headers,
      data: {
        title,
        authors: 'Tác giả minh họa',
        description: 'Tài liệu cho danh sách đọc.',
        materialType: 'EXERCISE',
        sourceReference: 'Tự biên soạn — minh họa',
        rightsBasis: 'Tác giả cho phép — minh họa',
        downloadAllowed: false,
        courseIds: [courseId],
      },
    });
    const id = (await draft.json()).item.id as string;
    expect(
      (
        await page.request.post(`/api/v1/material-drafts/${id}/pdf`, {
          headers: {
            ...headers,
            'Content-Type': 'application/pdf',
            'X-File-Name': 'danh-sach.pdf',
            'If-Match': '"1"',
          },
          data: readerPdf(),
        })
      ).status(),
    ).toBe(201);
    await markSafe(id);
    expect(
      (
        await page.request.post(`/api/v1/material-drafts/${id}/submit`, {
          headers,
          data: { revision: 2 },
        })
      ).status(),
    ).toBe(201);
  }
  await readerLogout(page);
  await login(page, 'admin');
  headers = await readerHeaders(page);
  const pending = (
    await (
      await page.request.get(`/api/v1/admin/publication-requests?search=${code}&limit=10`)
    ).json()
  ).items;
  expect(pending).toHaveLength(2);
  for (const request of pending)
    expect(
      (
        await page.request.post(`/api/v1/admin/publication-requests/${request.id}/decision`, {
          headers,
          data: {
            revision: request.revision,
            submittedRevision: request.submittedRevision,
            outcome: 'APPROVED',
            reason: 'Tài liệu minh họa được phép',
            rightsConfirmed: true,
          },
        })
      ).status(),
    ).toBe(201);
  await readerLogout(page);
  return { code, courseId, titles };
}

test('a lecturer arranges published materials by week and students open the chosen versions', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { code, courseId, titles } = await courseWithMaterials(page);
  await login(page, 'lecturer');
  await page.goto('/workspace/lecturer/reading-lists');
  await page.getByRole('combobox', { name: 'Môn được phân công', exact: true }).click();
  await page.getByRole('option', { name: `${code} · Môn có danh sách đọc`, exact: true }).click();
  await page.getByLabel('Tên danh sách', { exact: true }).fill('Lộ trình đọc học kỳ 1');
  await page.getByLabel('Tìm tài liệu của môn để thêm', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Tìm tài liệu', exact: true }).click();
  for (const title of [...titles].reverse())
    await page.getByRole('button', { name: `Thêm vào danh sách: ${title}`, exact: true }).click();
  // Added in reverse; restore the order with the move buttons.
  await page.getByRole('button', { name: new RegExp(`^Đưa lên: ${titles[0]}`) }).click();
  await page.getByLabel('Tuần hoặc chủ đề').first().fill('Tuần 1');
  await page.getByLabel('Ghi chú cho người đọc').first().fill('Đọc trước buổi học');
  await page.getByLabel('Tuần hoặc chủ đề').nth(1).fill('Tuần 2');
  await page.getByRole('button', { name: 'Lưu danh sách', exact: true }).click();
  await expect(page.getByText('Đã lưu bản nháp. Người đọc chưa thấy danh sách.')).toBeVisible();
  await page.getByLabel('Công bố cho người đọc của môn').check();
  await page.getByRole('button', { name: 'Lưu danh sách', exact: true }).click();
  await expect(page.getByText('Đã lưu. Người đọc của môn thấy danh sách này.')).toBeVisible();
  await readerLogout(page);

  await login(page, 'student');
  await page.goto(`/workspace/library/reading-lists?courseId=${courseId}`);
  const list = page.getByRole('article', { name: 'Lộ trình đọc học kỳ 1' });
  await expect(list.getByRole('heading', { name: 'Tuần 1' })).toBeVisible();
  await expect(list.getByRole('heading', { name: 'Tuần 2' })).toBeVisible();
  await expect(list.getByText('Đọc trước buổi học')).toBeVisible();
  const links = list.getByRole('link');
  await expect(links).toHaveText(titles);
  await links.first().click();
  await expect(page).toHaveURL(/\/workspace\/library\/versions\/\d+$/);
  await expect(page.getByRole('heading', { name: titles[0] })).toBeVisible({ timeout: 15_000 });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/workspace/library/reading-lists?courseId=${courseId}`);
  await expect(list).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
