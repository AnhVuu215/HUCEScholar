import { expect, test, type Page } from './helpers/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { readerHeaders, readerLogin, readerLogout } from './helpers/reader-session';
import { readerPdf } from './helpers/reader-pdf';

/** A student draft whose PDF stays CHECKING: no file worker runs in the browser suite. */
async function checkingDraft(page: Page) {
  const code = `UPL-${randomBytes(5).toString('hex').toUpperCase()}`;
  await readerLogin(page, 'admin', 'upload');
  let headers = await readerHeaders(page);
  const faculty = await page.request.post('/api/v1/admin/catalog/faculties', {
    headers,
    data: { code, name: 'Khoa kiểm thử upload' },
  });
  const course = await page.request.post('/api/v1/admin/catalog/courses', {
    headers,
    data: { code, name: 'Môn kiểm thử upload', facultyId: (await faculty.json()).item.id },
  });
  expect(course.status()).toBe(201);
  await readerLogout(page);
  await readerLogin(page, 'student', 'upload');
  headers = await readerHeaders(page);
  const title = `Tài liệu chờ quét ${code}`;
  const draft = await page.request.post('/api/v1/material-drafts', {
    headers,
    data: {
      title,
      authors: 'Tác giả minh họa',
      description: 'PDF chờ kiểm tra an toàn.',
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
      'X-File-Name': 'cho-quet.pdf',
      'If-Match': '"1"',
    },
    data: readerPdf(),
  });
  expect(upload.status()).toBe(201);
  return { id, title };
}

const pdf = (page: Page) => page.getByRole('region', { name: 'PDF của bản nháp' });

async function openDraft(page: Page, title: string) {
  await page.goto('/workspace/student/materials');
  await page.getByRole('button', { name: `Mở bản nháp ${title}`, exact: true }).click();
  await expect(pdf(page).getByText('PDF đang kiểm tra', { exact: true })).toBeVisible();
}

async function markSafe(id: string) {
  const environment = parseEnv(readFileSync('.local/test.env', 'utf8'));
  const url = new URL(environment.TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test')) throw new Error('Isolated test database required.');
  const { Client } = createRequire(`${process.cwd()}/apps/api/package.json`)('pg');
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    await db.query(
      "UPDATE hucescholar.files SET scan_status='SAFE',checked_at=now(),page_count=2,has_text_layer=true WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE document_id=$1)",
      [id],
    );
  } finally {
    await db.end();
  }
}

const hint = (page: Page) => page.locator('.scan-watch');

test('lost connection while waiting is reported as connectivity, not as a file problem', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const { id, title } = await checkingDraft(page);
  await openDraft(page, title);
  const status = `**/api/v1/material-drafts/${id}`;
  await page.route(status, (route) =>
    route.request().method() === 'GET' ? route.abort('failed') : route.continue(),
  );
  await expect(hint(page)).toContainText('đang thử lại', { timeout: 10_000 });
  await expect(hint(page)).toContainText('Mất kết nối khi chờ kết quả', { timeout: 15_000 });
  await expect(hint(page)).toContainText('không cần tải lên lại');
  await expect(pdf(page).getByText(/không đạt kiểm tra/)).toHaveCount(0);
  await page.unroute(status);
  await markSafe(id);
  await page.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).click();
  await expect(pdf(page).getByText('PDF đã qua kiểm tra kỹ thuật', { exact: true })).toBeVisible();
  await expect(hint(page)).toHaveCount(0);
});

test('a hidden tab stops polling and checks at once when shown again', async ({ page }) => {
  const { id, title } = await checkingDraft(page);
  let requests = 0;
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().endsWith(`/api/v1/material-drafts/${id}`))
      requests++;
  });
  await openDraft(page, title);
  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate((value) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  const before = requests;
  await setVisibility('hidden');
  await page.waitForTimeout(6_000);
  expect(requests).toBe(before);
  await setVisibility('visible');
  await expect.poll(() => requests, { timeout: 2_000 }).toBeGreaterThan(before);
});

test('after the watch budget the page says the file is still processing', async ({ page }) => {
  test.setTimeout(90_000);
  const { title } = await checkingDraft(page);
  await page.clock.install();
  await openDraft(page, title);
  // Advance fake time one poll at a time and let each real response land before the next step,
  // so the request's own timeout is never fast-forwarded.
  for (let step = 0; step < 20; step++) {
    const response = page
      .waitForResponse((r) => /\/api\/v1\/material-drafts\/\d+$/.test(r.url()), { timeout: 3_000 })
      .catch(() => null);
    await page.clock.runFor(16_000);
    await response;
    if ((await hint(page).textContent())?.includes('Sau ba phút')) break;
  }
  await expect(hint(page)).toContainText('Sau ba phút file vẫn đang được xử lý');
  await expect(hint(page)).toContainText('không cần tải lên lại');
});
