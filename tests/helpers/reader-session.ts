import { expect, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { readerPdf } from './reader-pdf';

export async function readerHeaders(page: Page) {
  const response = await page.request.get('/api/v1/auth/csrf');
  expect(response.status()).toBe(200);
  return {
    Origin: 'http://127.0.0.1:3100',
    'X-CSRF-Token': (await response.json()).csrfToken as string,
  };
}

export async function readerLogin(page: Page, role: 'admin' | 'student', account = 'reader-v2') {
  const response = await page.request.post('/api/v1/auth/login', {
    headers: await readerHeaders(page),
    data: { email: `e2e-${account}-${role}@example.test`, password: process.env.E2E_PASSWORD! },
  });
  expect(response.status()).toBe(200);
}

export async function readerLogout(page: Page) {
  expect(
    (
      await page.request.post('/api/v1/auth/logout', { headers: await readerHeaders(page) })
    ).status(),
  ).toBe(204);
}
/** Legacy annotation scenarios explicitly opt into an open panel; production defaults stay closed. */
export async function configureReaderPanel(page: Page) {
  const result = await page.request.get('/api/v1/account/preferences');
  expect(result.status()).toBe(200);
  const { preferences, revision } = await result.json();
  if (preferences.annotationPanelOpen) return;
  expect(
    (
      await page.request.put('/api/v1/account/preferences', {
        headers: await readerHeaders(page),
        data: { preferences: { ...preferences, annotationPanelOpen: true }, revision },
      })
    ).status(),
  ).toBe(200);
}

/** Real publication workflow with an original PDF and explicitly synthetic scan result in the test DB. */
export async function openReaderFixture(
  page: Page,
  account = 'reader-v2',
  options: {
    scan?: boolean;
    longText?: boolean;
    outline?: boolean;
    splitText?: boolean;
    rotated?: boolean;
    panelOpen?: boolean;
  } = {},
) {
  const code = `READV2-${randomBytes(5).toString('hex').toUpperCase()}`;
  await readerLogin(page, 'admin', account);
  let headers = await readerHeaders(page);
  const faculty = await page.request.post('/api/v1/admin/catalog/faculties', {
    headers,
    data: { code, name: 'Khoa kiểm thử reader' },
  });
  expect(faculty.status()).toBe(201);
  const course = await page.request.post('/api/v1/admin/catalog/courses', {
    headers,
    data: { code, name: 'Môn kiểm thử reader', facultyId: (await faculty.json()).item.id },
  });
  expect(course.status()).toBe(201);
  const courseId = (await course.json()).item.id;
  await readerLogout(page);
  await readerLogin(page, 'student', account);
  headers = await readerHeaders(page);
  const draft = await page.request.post('/api/v1/material-drafts', {
    headers,
    data: {
      title: `Tài liệu kiểm thử ${code}`,
      authors: 'Tác giả minh họa',
      description: 'PDF gốc dùng kiểm thử reader.',
      materialType: 'EXERCISE',
      sourceReference: 'Tự biên soạn — minh họa',
      rightsBasis: 'Tác giả cho phép — minh họa',
      downloadAllowed: true,
      courseIds: [courseId],
    },
  });
  expect(draft.status()).toBe(201);
  const item = (await draft.json()).item;
  const upload = await page.request.post(`/api/v1/material-drafts/${item.id}/pdf`, {
    headers: {
      ...headers,
      'Content-Type': 'application/pdf',
      'X-File-Name': 'reader-v2.pdf',
      'If-Match': '"1"',
    },
    data: readerPdf(options),
  });
  expect(upload.status()).toBe(201);
  const environment = parseEnv(readFileSync('.local/test.env', 'utf8'));
  const url = new URL(environment.TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test')) throw new Error('Isolated test database required.');
  const { Client } = createRequire(`${process.cwd()}/apps/api/package.json`)('pg');
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    const result = await db.query(
      "UPDATE hucescholar.files SET scan_status='SAFE',checked_at=now(),page_count=2,has_text_layer=$3 WHERE id=(SELECT file_id FROM hucescholar.document_versions v JOIN hucescholar.users u ON u.id=v.created_by WHERE document_id=$1 AND u.email=$2)",
      [item.id, `e2e-${account}-student@example.test`, !options.scan],
    );
    expect(result.rowCount).toBe(1);
  } finally {
    await db.end();
  }
  expect(
    (
      await page.request.post(`/api/v1/material-drafts/${item.id}/submit`, {
        headers,
        data: { revision: 2 },
      })
    ).status(),
  ).toBe(201);
  await readerLogout(page);
  await readerLogin(page, 'admin', account);
  const publication = (
    await (await page.request.get(`/api/v1/admin/publication-requests?search=${code}`)).json()
  ).items[0];
  const decision = await page.request.post(
    `/api/v1/admin/publication-requests/${publication.id}/decision`,
    {
      headers: await readerHeaders(page),
      data: {
        revision: publication.revision,
        submittedRevision: publication.submittedRevision,
        outcome: 'APPROVED',
        reason: 'PDF kiểm thử được phép',
        rightsConfirmed: true,
      },
    },
  );
  expect(decision.status()).toBe(201);
  await readerLogout(page);
  await readerLogin(page, 'student', account);
  const versionId = publication.versionId as string;
  if (options.panelOpen !== false) await configureReaderPanel(page);
  const route = `/workspace/library/versions/${versionId}`;
  await page.goto(route);
  await expect(page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' })).toBeVisible(
    { timeout: 15000 },
  );
  return { versionId, route, path: `/api/v1/library/versions/${versionId}` };
}

export async function selectReaderText(page: Page) {
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
  await expect(page.getByRole('button', { name: 'Tô sáng đoạn chọn', exact: true })).toBeEnabled();
}
