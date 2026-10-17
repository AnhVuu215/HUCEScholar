import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { readerPdf } from './helpers/reader-pdf';

async function login(page: Page, role: 'lecturer' | 'student', accountPrefix = 'e2e-drafts') {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(`${accountPrefix}-${role}@example.test`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(`/workspace/${role}`);
  await page.getByRole('link', { name: 'Học liệu của tôi', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Học liệu của tôi', exact: true })).toBeVisible();
}
async function seed(page: Page, role: 'lecturer' | 'student', accountPrefix = 'e2e-drafts') {
  const code = `MAT-${randomBytes(5).toString('hex').toUpperCase()}`;
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
  const headers = { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf };
  expect(
    (
      await page.request.post('/api/v1/auth/login', {
        headers,
        data: { email: `${accountPrefix}-admin@example.test`, password: process.env.E2E_PASSWORD! },
      })
    ).status(),
  ).toBe(200);
  const token = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
  headers['X-CSRF-Token'] = token;
  const faculty = await page.request.post('/api/v1/admin/catalog/faculties', {
    headers,
    data: { code, name: 'Khoa minh họa kiểm thử' },
  });
  expect(faculty.status()).toBe(201);
  const course = await page.request.post('/api/v1/admin/catalog/courses', {
    headers,
    data: {
      code,
      name: 'Môn minh họa kiểm thử học liệu',
      facultyId: (await faculty.json()).item.id,
    },
  });
  expect(course.status()).toBe(201);
  if (role === 'lecturer') {
    const users = await (
      await page.request.get(`/api/v1/admin/users?search=${accountPrefix}-lecturer%40example.test`)
    ).json();
    expect(
      (
        await page.request.post('/api/v1/admin/assignments', {
          headers,
          data: { lecturerId: users.items[0].id, courseId: (await course.json()).item.id },
        })
      ).status(),
    ).toBe(201);
  }
  expect((await page.request.post('/api/v1/auth/logout', { headers })).status()).toBe(204);
  return code;
}
async function fill(page: Page, code: string) {
  await page.getByRole('button', { name: 'Tạo bản nháp', exact: true }).click();
  await page.getByLabel('Tiêu đề học liệu', { exact: true }).fill(`Học liệu minh họa ${code}`);
  await page.getByLabel('Tác giả', { exact: false }).fill('Tác giả kiểm thử');
  await page.getByLabel('Loại học liệu', { exact: true }).selectOption('EXERCISE');
  await page
    .getByLabel('Nguồn tài liệu', { exact: true })
    .fill('Tài liệu tổng hợp tự biên soạn — dữ liệu kiểm thử');
  if (await page.getByLabel('Căn cứ quyền sử dụng', { exact: true }).count())
    await page
      .getByLabel('Căn cứ quyền sử dụng', { exact: true })
      .fill('Tác giả cho phép chia sẻ học tập — minh họa');
  await page.getByLabel('Tìm môn học liên quan', { exact: true }).fill(code);
  await expect(
    page
      .getByLabel('Môn học liên quan', { exact: true })
      .getByRole('option', { name: `${code} · Môn minh họa kiểm thử học liệu`, exact: true }),
  ).toBeAttached();
  await page
    .getByLabel('Môn học liên quan', { exact: true })
    .selectOption({ label: `${code} · Môn minh họa kiểm thử học liệu` });
  await page.getByRole('button', { name: 'Thêm môn', exact: true }).click();
}
async function markSyntheticSafe(id: string, pageCount = 1) {
  const environment = parseEnv(readFileSync('.local/test.env', 'utf8'));
  const url = new URL(environment.TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test')) throw new Error('Test database required.');
  const requireApi = createRequire(`${process.cwd()}/apps/api/package.json`);
  const { Client } = requireApi('pg');
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    // Explicit synthetic scan fixture; does not claim real scanner evidence.
    const result = await db.query(
      "UPDATE hucescholar.files SET scan_status='SAFE',checked_at=now(),page_count=$2,has_text_layer=true WHERE id=(SELECT file_id FROM hucescholar.document_versions v JOIN hucescholar.users u ON u.id=v.created_by WHERE document_id=$1 AND (u.email LIKE 'e2e-drafts-%@example.test' OR u.email LIKE 'e2e-reader-%@example.test' OR u.email LIKE 'e2e-notes-%@example.test' OR u.email LIKE 'e2e-highlights-%@example.test' OR u.email LIKE 'e2e-progress-%@example.test' OR u.email LIKE 'e2e-personal-%@example.test' OR u.email LIKE 'e2e-selfpublish-%@example.test' OR u.email LIKE 'e2e-versions-%@example.test' OR u.email LIKE 'e2e-lifecycle-%@example.test'))",
      [id, pageCount],
    );
    expect(result.rowCount).toBe(1);
  } finally {
    await db.end();
  }
}
async function logoutForTest(page: Page) {
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
  expect(
    (
      await page.request.post('/api/v1/auth/logout', {
        headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf },
      })
    ).status(),
  ).toBe(204);
}
async function adminReviewLogin(page: Page, code: string, accountPrefix = 'e2e-drafts') {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(`${accountPrefix}-admin@example.test`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('link', { name: 'Kiểm duyệt học liệu', exact: true }).click();
  await page.getByLabel('Tìm yêu cầu', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page
    .getByRole('button', { name: `Xem yêu cầu Học liệu minh họa ${code}`, exact: true })
    .click();
}
async function submittedForReview(
  page: Page,
  role: 'student' | 'lecturer',
  readable = false,
  accountPrefix = readable ? 'e2e-reader' : 'e2e-drafts',
) {
  const code = await seed(page, role, accountPrefix);
  await login(page, role, accountPrefix);
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
  const headers = { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf };
  const created = await page.request.post('/api/v1/material-drafts', {
    headers,
    data: {
      title: `Học liệu minh họa ${code}`,
      authors: 'Tác giả kiểm thử',
      description: 'Nội dung synthetic cho kiểm thử kiểm duyệt.',
      materialType: 'EXERCISE',
      sourceReference: 'Tự biên soạn — nguồn minh họa',
      rightsBasis: 'Tác giả cho phép — căn cứ minh họa',
      downloadAllowed: readable,
      courseIds: [
        (await (await page.request.get('/api/v1/material-drafts/courses?search=' + code)).json())
          .items[0].id,
      ],
    },
  });
  expect(created.status()).toBe(201);
  const item = (await created.json()).item;
  expect(
    (
      await page.request.post(`/api/v1/material-drafts/${item.id}/pdf`, {
        headers: {
          ...headers,
          'Content-Type': 'application/pdf',
          'X-File-Name': 'synthetic-review.pdf',
          'If-Match': '"1"',
        },
        data: readable ? readerPdf() : Buffer.from('%PDF-1.7\nSynthetic review fixture'),
      })
    ).status(),
  ).toBe(201);
  await markSyntheticSafe(item.id, readable ? 2 : 1);
  expect(
    (
      await page.request.post(`/api/v1/material-drafts/${item.id}/submit`, {
        headers,
        data: { revision: 2 },
      })
    ).status(),
  ).toBe(201);
  await logoutForTest(page);
  return { code, id: item.id };
}

test('student searches the library and reads, selects text, changes pages, zooms and downloads a permitted PDF', async ({
  page,
}) => {
  test.setTimeout(90000);
  const { code } = await submittedForReview(page, 'student', true);
  await adminReviewLogin(page, code, 'e2e-reader');
  const request = (
    await (await page.request.get('/api/v1/admin/publication-requests?search=' + code)).json()
  ).items[0];
  const token = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
  expect(
    (
      await page.request.post(`/api/v1/admin/publication-requests/${request.id}/decision`, {
        headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': token },
        data: {
          revision: request.revision,
          submittedRevision: request.submittedRevision,
          outcome: 'APPROVED',
          reason: 'Fixture created by this test; permitted for reading',
          rightsConfirmed: true,
        },
      })
    ).status(),
  ).toBe(201);
  await logoutForTest(page);
  await login(page, 'student', 'e2e-reader');
  await page.getByRole('link', { name: 'Kho học liệu', exact: true }).click();
  await page.getByLabel('Tìm học liệu', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await expect(
    page.getByRole('link', { name: `Đọc Học liệu minh họa ${code}`, exact: true }),
  ).toBeVisible();
  if (process.env.CAPTURE_LIBRARY_UI === '1') {
    mkdirSync('.impeccable/review/library', { recursive: true });
    for (const [name, width, height] of [
      ['desktop', 1440, 1000],
      ['tablet', 768, 1024],
      ['mobile', 360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `.impeccable/review/library/${name}-catalog.png`,
        fullPage: true,
      });
    }
  }
  await page.getByRole('link', { name: `Đọc Học liệu minh họa ${code}`, exact: true }).click();
  await expect(page.getByText('Đã hiển thị trang 1 / 2', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('.textLayer')).toContainText('HUCEScholar reader fixture');
  expect(
    await page.locator('.reader-page canvas').evaluate((node: HTMLCanvasElement) => {
      const pixels = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
      return pixels.some((value, index) => index % 4 !== 3 && value < 100);
    }),
  ).toBe(true);
  const selectedText = await page.locator('.textLayer').evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
  expect(selectedText).toContain('HUCEScholar reader fixture');
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(page.getByText('Đã hiển thị trang 2 / 2', { exact: true })).toBeVisible();
  await expect(page.locator('.textLayer')).toContainText('Second page');
  await page.getByLabel('Mức phóng', { exact: true }).selectOption('1.25');
  await page.getByRole('button', { name: 'Xoay trang', exact: true }).click();
  await expect(page.getByText('Đã hiển thị trang 2 / 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xoay trang', exact: true }).click();
  await page.getByLabel('Mức phóng', { exact: true }).selectOption('fit');
  await page.getByRole('button', { name: 'Xoay trang', exact: true }).click();
  await page.getByRole('button', { name: 'Xoay trang', exact: true }).click();
  if (process.env.CAPTURE_LIBRARY_UI === '1')
    for (const [name, width, height] of [
      ['desktop', 1440, 1000],
      ['tablet', 768, 1024],
      ['mobile', 360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(async () =>
          page.locator('.reader-stage').evaluate((node) => {
            const canvas = node.querySelector('canvas');
            return canvas
              ? Math.abs(node.clientWidth - 64 - canvas.getBoundingClientRect().width)
              : 999;
          }),
        )
        .toBeLessThan(2);
      await expect(page.getByText('Đã hiển thị trang 2 / 2', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `.impeccable/review/library/${name}-reader.png`,
        fullPage: true,
      });
    }
  const downloadPath = (await page
    .getByRole('link', { name: 'Tải PDF gốc', exact: true })
    .getAttribute('href'))!;
  const downloaded = await page.request.get(downloadPath);
  expect(downloaded.status()).toBe(200);
  expect(downloaded.headers()['content-disposition']).toContain('attachment');
  expect((await downloaded.body()).equals(readerPdf())).toBe(true);
  const pdfPath = downloadPath.replace('/download', '/pdf');
  const range = await page.request.get(pdfPath, { headers: { Range: 'bytes=0-4' } });
  expect(range.status()).toBe(206);
  expect((await range.body()).toString()).toBe('%PDF-');
  // Reload/retry resumes acknowledged progress; do not race the debounced page-2 save.
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu tiến độ · Trang 2' }),
  ).toBeVisible();
  await page.route('**/api/v1/library/versions/*/pdf', (route) => route.abort());
  await page.reload();
  await expect(page.getByRole('button', { name: 'Thử mở lại PDF', exact: true })).toBeVisible();
  await page.unroute('**/api/v1/library/versions/*/pdf');
  await page.getByRole('button', { name: 'Thử mở lại PDF', exact: true }).click();
  await expect(page.getByText('Đã hiển thị trang 2 / 2', { exact: true })).toBeVisible();
});
async function openPersonalReader(page: Page, prefix: string) {
  const { code } = await submittedForReview(page, 'student', true, prefix);
  await adminReviewLogin(page, code, prefix);
  const item = (
    await (await page.request.get('/api/v1/admin/publication-requests?search=' + code)).json()
  ).items[0];
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
  expect(
    (
      await page.request.post(`/api/v1/admin/publication-requests/${item.id}/decision`, {
        headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf },
        data: {
          revision: item.revision,
          submittedRevision: item.submittedRevision,
          outcome: 'APPROVED',
          reason: 'Original test PDF permitted',
          rightsConfirmed: true,
        },
      })
    ).status(),
  ).toBe(201);
  await logoutForTest(page);
  await login(page, 'student', prefix);
  await page.goto(`/workspace/library/versions/${item.versionId}`);
  await expect(page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' })).toBeVisible(
    { timeout: 15_000 },
  );
  return `/api/v1/library/versions/${item.versionId}`;
}
async function capturePersonal(page: Page, prefix: string) {
  if (process.env.CAPTURE_PERSONAL_UI !== '1') return;
  mkdirSync('.impeccable/review/personal', { recursive: true });
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['tablet', 768, 1024],
    ['mobile', 360, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    if (prefix === 'reader-') {
      await expect
        .poll(() =>
          page.locator('.reader-stage').evaluate((stage) => {
            const canvas = stage.querySelector('canvas');
            return (
              !!canvas &&
              Math.abs(
                canvas.getBoundingClientRect().width - Math.max(160, stage.clientWidth - 64),
              ) < 3
            );
          }),
        )
        .toBe(true);
    } else {
      for (const link of await page.locator('.personal-library article > .primary-button').all()) {
        const box = await link.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `.impeccable/review/personal/${prefix}${name}.png`,
      fullPage: true,
    });
  }
}
test('lecturer self-publication needs no rights declaration or admin decision and recovers after response loss', async ({
  page,
}) => {
  test.setTimeout(90000);
  const code = await seed(page, 'lecturer', 'e2e-selfpublish');
  await login(page, 'lecturer', 'e2e-selfpublish');
  await page.getByRole('button', { name: 'Tạo bản nháp', exact: true }).click();
  await page.getByLabel('Tiêu đề học liệu', { exact: true }).fill(`PDF tự công bố ${code}`);
  await page.getByLabel('Tìm môn học liên quan', { exact: true }).fill(code);
  await page
    .getByLabel('Môn học liên quan', { exact: true })
    .selectOption({ label: `${code} · Môn minh họa kiểm thử học liệu` });
  await page.getByRole('button', { name: 'Thêm môn', exact: true }).click();
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu bản nháp' })).toBeVisible();
  await page
    .getByRole('button', { name: `Mở bản nháp PDF tự công bố ${code}`, exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Công bố', exact: true })).toBeDisabled();
  await page.getByLabel('Chọn PDF', { exact: true }).setInputFiles({
    name: 'self-published.pdf',
    mimeType: 'application/pdf',
    buffer: readerPdf(),
  });
  await page.getByRole('button', { name: 'Tải PDF lên', exact: true }).click();
  await expect(page.getByText('Lần lưu 2', { exact: false })).toBeVisible();
  const item = (await (await page.request.get('/api/v1/material-drafts?search=' + code)).json())
    .items[0];
  await markSyntheticSafe(item.id, 2);
  await page.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Công bố', exact: true })).toBeEnabled();
  await page.route('**/api/v1/material-drafts/*/publish', async (route) => {
    await route.fetch();
    await route.abort();
  });
  await page.getByRole('button', { name: 'Công bố', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận công bố', exact: true }).click();
  await expect(page.locator('.publication-actions [role="alert"]')).toContainText(
    'Tải trạng thái công bố',
  );
  await page.unroute('**/api/v1/material-drafts/*/publish');
  await page.getByRole('button', { name: 'Tải trạng thái công bố', exact: true }).click();
  await expect(page.locator('.publication-actions')).toContainText('Đã công bố');
  await expect(
    page
      .getByRole('region', { name: 'Lịch sử phiên bản', exact: true })
      .getByRole('listitem')
      .first(),
  ).toContainText('Phiên bản 1 · Đã công bố');
  await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toBeDisabled();
  if (process.env.CAPTURE_SELF_PUBLISH_UI === '1') {
    mkdirSync('.impeccable/review/self-publication', { recursive: true });
    for (const [name, width, height] of [
      ['desktop', 1440, 1000],
      ['tablet', 768, 1024],
      ['mobile', 360, 900],
    ] as const) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `.impeccable/review/self-publication/${name}.png`,
        fullPage: true,
      });
    }
  }
  const history = await (
    await page.request.get(`/api/v1/material-drafts/${item.id}/requests`)
  ).json();
  expect(history.total).toBe(0);
  const current = (await (await page.request.get(`/api/v1/material-drafts/${item.id}`)).json())
    .item;
  expect(current).toMatchObject({
    publicationMethod: 'LECTURER_SELF',
    sourceReference: '',
    rightsBasis: '',
  });
  await page.getByRole('link', { name: 'Kho học liệu', exact: true }).click();
  await page.getByLabel('Tìm học liệu', { exact: false }).fill(code);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page.getByRole('link', { name: `Đọc PDF tự công bố ${code}`, exact: true }).click();
  await expect(page.getByText('Đã hiển thị trang 1 / 2', { exact: true })).toBeVisible();
});
test('personal library saves after response loss, shows recent page and removes only its saved link', async ({
  page,
}) => {
  test.setTimeout(90000);
  // A failed initial read must not be mistaken for an unsaved document.
  await page.route('**/api/v1/personal-library/saved/*', (route) =>
    route.request().method() === 'GET' ? route.abort() : route.continue(),
  );
  const path = await openPersonalReader(page, 'e2e-personal');
  await expect(page.getByRole('alert').filter({ hasText: 'Tải trạng thái lưu' })).toBeVisible();
  await expect(page.locator('.saved-control > button').first()).toBeDisabled();
  await page.getByRole('button', { name: 'Tải trạng thái lưu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tải trạng thái lưu', exact: true })).toBeEnabled();
  await expect(page.locator('.saved-control > button').first()).toBeDisabled();
  await page.unroute('**/api/v1/personal-library/saved/*');
  await page.getByRole('button', { name: 'Tải trạng thái lưu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lưu tài liệu', exact: true })).toBeEnabled();
  const material = await (await page.request.get(path)).json();
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu tiến độ · Trang 2' }),
  ).toBeVisible();
  await page.route('**/api/v1/personal-library/saved/*', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    await route.fetch();
    await route.abort();
  });
  await page.getByRole('button', { name: 'Lưu tài liệu', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Tải trạng thái lưu' })).toBeVisible();
  await page.unroute('**/api/v1/personal-library/saved/*');
  await page.getByRole('button', { name: 'Tải trạng thái lưu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bỏ lưu tài liệu', exact: true })).toBeEnabled();
  await capturePersonal(page, 'reader-');
  await page.getByRole('link', { name: 'Thư viện của tôi', exact: true }).click();
  const row = page.getByRole('article', { name: material.item.title, exact: true });
  await expect(row).toBeVisible();
  await page.getByRole('button', { name: 'Đọc gần đây', exact: true }).click();
  await expect(row.getByText('Đã đọc đến trang 2', { exact: true })).toBeVisible();
  await capturePersonal(page, 'recent-');
  await row.getByRole('link', { name: 'Đọc tiếp', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Thư viện của tôi', exact: true }).click();
  await expect(row).toBeVisible();
  await capturePersonal(page, '');
  const savedList = await (await page.request.get('/api/v1/personal-library/saved')).json();
  await page.route('**/api/v1/personal-library/saved?*', (route) => {
    const pageNumber = Number(new URL(route.request().url()).searchParams.get('page'));
    return route.fulfill({ json: { ...savedList, total: 13, limit: 12, page: pageNumber } });
  });
  await page.getByRole('button', { name: 'Đã lưu', exact: true }).click();
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Trang 2/2' })).toBeFocused();
  await page.getByRole('button', { name: 'Trang trước', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Trang 1/2' })).toBeFocused();
  await page.unroute('**/api/v1/personal-library/saved?*');
  await page.getByRole('button', { name: 'Đã lưu', exact: true }).click();
  await row.getByRole('button', { name: 'Bỏ lưu tài liệu', exact: true }).click();
  await page.route('**/api/v1/personal-library/saved/*', async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    await route.fetch();
    await route.abort();
  });
  await row.getByRole('button', { name: 'Xác nhận bỏ lưu', exact: true }).click();
  await expect(row.getByRole('alert')).toContainText('Tải trạng thái lưu');
  await page.unroute('**/api/v1/personal-library/saved/*');
  await row.getByRole('button', { name: 'Tải trạng thái lưu', exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Ghi chú và tiến độ được giữ nguyên.' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Đọc gần đây', exact: true }).click();
  await expect(row).toBeVisible();
  await page.route('**/api/v1/personal-library/recent?*', (route) => route.abort());
  await page.reload();
  await page.getByRole('button', { name: 'Đọc gần đây', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Thử tải thư viện', exact: true })).toBeVisible();
  await page.unroute('**/api/v1/personal-library/recent?*');
  await page.getByRole('button', { name: 'Thử tải thư viện', exact: true }).click();
  await expect(row).toBeVisible();
});
test('lifecycle owner creates one successor after a lost response and can inspect the original review history', async ({
  page,
}) => {
  test.setTimeout(90000);
  const path = await openPersonalReader(page, 'e2e-versions');
  const versionId = path.split('/').at(-1)!;
  const draft = (await (await page.request.get('/api/v1/material-drafts')).json()).items.find(
    (v: { versionId: string }) => v.versionId === versionId,
  );
  await page.goto('/workspace/student/materials');
  await page.getByRole('button', { name: `Mở bản nháp ${draft.title}`, exact: true }).click();
  await page.getByRole('button', { name: 'Tạo phiên bản kế tiếp', exact: true }).click();
  await page.route('**/api/v1/material-drafts/*/versions', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fetch();
    await route.abort();
  });
  await page.getByRole('button', { name: 'Xác nhận tạo phiên bản', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Tải trạng thái duyệt' })).toBeVisible();
  await page.unroute('**/api/v1/material-drafts/*/versions');
  await page.getByRole('button', { name: 'Tải trạng thái duyệt', exact: true }).click();
  await expect(page.getByLabel('Nguồn tài liệu', { exact: true })).toHaveValue('');
  await expect(
    page
      .getByRole('region', { name: 'PDF của bản nháp' })
      .getByText('Chưa có PDF', { exact: true }),
  ).toBeVisible();
  const versions = (
    await (await page.request.get(`/api/v1/material-drafts/${draft.id}/versions`)).json()
  ).items;
  expect(versions.map((v: { versionNo: number }) => v.versionNo)).toEqual([2, 1]);
  await page.getByRole('button', { name: 'Xem lần duyệt phiên bản 1', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Lịch sử phiên bản' }).getByText('Đã duyệt', { exact: true }),
  ).toBeVisible();
  expect((await page.request.get(path)).status()).toBe(200);
  if (process.env.CAPTURE_LIFECYCLE_UI === '1') {
    mkdirSync('.impeccable/review/lifecycle', { recursive: true });
    for (const [name, width, height] of [
      ['desktop', 1440, 1100],
      ['tablet', 768, 1100],
      ['mobile', 360, 1000],
    ] as const) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `.impeccable/review/lifecycle/owner-${name}.png`,
        fullPage: true,
      });
    }
  }
});

test('lifecycle admin transfers published material and recovers a stale hide before restoring', async ({
  page,
}) => {
  test.setTimeout(90000);
  const { code } = await submittedForReview(page, 'lecturer', false, 'e2e-lifecycle');
  await adminReviewLogin(page, code, 'e2e-lifecycle');
  const pending = (
    await (await page.request.get('/api/v1/admin/publication-requests?search=' + code)).json()
  ).items[0];
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
  const headers = { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf };
  expect(
    (
      await page.request.post(`/api/v1/admin/publication-requests/${pending.id}/decision`, {
        headers,
        data: {
          revision: pending.revision,
          submittedRevision: pending.submittedRevision,
          outcome: 'APPROVED',
          reason: 'Synthetic permitted',
          rightsConfirmed: true,
        },
      })
    ).status(),
  ).toBe(201);
  const recipient = (
    await (
      await page.request.get('/api/v1/admin/users?search=e2e-lifecycle-receiver%40example.test')
    ).json()
  ).items[0];
  for (const c of pending.courses)
    expect(
      (
        await page.request.post('/api/v1/admin/assignments', {
          headers,
          data: { lecturerId: recipient.id, courseId: c.id },
        })
      ).status(),
    ).toBe(201);
  await page.getByRole('link', { name: 'Quản lý học liệu', exact: true }).click();
  await page.getByLabel('Tìm tài liệu quản lý', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page
    .getByRole('button', { name: `Quản lý Học liệu minh họa ${code}`, exact: true })
    .click();
  await page.getByLabel('Giảng viên nhận', { exact: true }).selectOption(recipient.id);
  await page.getByLabel('Lý do bàn giao', { exact: true }).fill('Bàn giao để tiếp tục biên soạn');
  await page.getByRole('button', { name: 'Bàn giao', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận bàn giao', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã bàn giao' })).toBeVisible();
  await page.getByLabel('Lý do đổi hiển thị', { exact: true }).fill('Đối chiếu quyền nguồn');
  await page.getByRole('button', { name: 'Ẩn toàn tài liệu', exact: true }).click();
  const current = (
    await (await page.request.get(`/api/v1/admin/materials/${pending.documentId}`)).json()
  ).item;
  expect(
    (
      await page.request.post(`/api/v1/admin/materials/${pending.documentId}/visibility`, {
        headers,
        data: { revision: current.revision, visibility: 'HIDDEN', reason: 'Đã ẩn ở tab khác' },
      })
    ).status(),
  ).toBe(201);
  await page.getByRole('button', { name: 'Xác nhận đổi hiển thị', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Tải trạng thái tài liệu' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tải trạng thái tài liệu', exact: true }).click();
  await expect(page.getByLabel('Lý do đổi hiển thị', { exact: true })).toHaveValue(
    'Đối chiếu quyền nguồn',
  );
  await page.getByLabel('Đã giải quyết lý do ẩn', { exact: true }).check();
  await page.getByRole('button', { name: 'Khôi phục hiển thị', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận đổi hiển thị', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã khôi phục' })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 1000 });
  await expect
    .poll(() =>
      page.locator('.lifecycle-history-pagination').evaluate((pager) => {
        const bounds = pager.getBoundingClientRect();
        return Array.from(pager.children).every((child) => {
          const box = child.getBoundingClientRect();
          return box.left >= bounds.left && box.right <= bounds.right + 1;
        });
      }),
    )
    .toBe(true);
  if (process.env.CAPTURE_LIFECYCLE_UI === '1') {
    mkdirSync('.impeccable/review/lifecycle', { recursive: true });
    for (const [name, width, height] of [
      ['desktop', 1440, 1100],
      ['tablet', 768, 1100],
      ['mobile', 360, 1000],
    ] as const) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `.impeccable/review/lifecycle/${name}.png`, fullPage: true });
    }
  }
});

test('private PDF text highlights survive retry, zoom, rotation, page changes and reload', async ({
  page,
}) => {
  test.setTimeout(120000);
  const path = await openPersonalReader(page, 'e2e-highlights');
  const text = page
    .locator('.textLayer span')
    .filter({ hasText: 'HUCEScholar reader fixture' })
    .first();
  const box = (await text.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 15 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Tô sáng đoạn chọn', exact: true }).click();
  const editor = page.getByLabel('Ghi chú cho đoạn tô', { exact: true });
  await editor.fill('Điểm cần nhớ <b>riêng tư</b>');
  const pageNote = page.getByLabel('Nội dung ghi chú', { exact: true });
  await pageNote.fill('Bản soạn ghi chú theo trang');
  let leavePrompts = 0;
  const stay = async (dialog: import('@playwright/test').Dialog) => {
    leavePrompts++;
    await dialog.dismiss();
  };
  page.on('dialog', stay);
  await page.getByRole('link', { name: 'Về kho học liệu', exact: true }).click();
  expect(leavePrompts).toBe(1);
  await expect(editor).toHaveValue('Điểm cần nhớ <b>riêng tư</b>');
  await expect(pageNote).toHaveValue('Bản soạn ghi chú theo trang');
  page.off('dialog', stay);
  await page.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
  await page.getByLabel('Màu tô sáng', { exact: true }).selectOption('#90CAF9');
  await page.route('**/api/v1/library/versions/*/highlights', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fetch();
    await route.abort();
  });
  await page.getByRole('button', { name: 'Lưu vùng tô', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Chưa xác nhận được lần lưu' }),
  ).toBeVisible();
  await expect(editor).toHaveValue('Điểm cần nhớ <b>riêng tư</b>');
  await page.unroute('**/api/v1/library/versions/*/highlights');
  await page.route('**/api/v1/auth/csrf', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await page.getByRole('button', { name: 'Lưu vùng tô', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lưu vùng tô', exact: true })).toBeEnabled();
  await expect(editor).toHaveAttribute('readonly', '');
  await expect(page.getByLabel('Màu tô sáng', { exact: true })).toBeDisabled();
  await page.unroute('**/api/v1/auth/csrf');
  await page.getByRole('button', { name: 'Lưu vùng tô', exact: true }).click();
  const list = (await (await page.request.get(`${path}/highlights?pageNumber=1`)).json()).items;
  expect(list).toHaveLength(1);
  const id = list[0].id;
  const overlay = page.locator(`[data-highlight-id="${id}"]`).first();
  await expect(overlay).toBeVisible();
  for (const angle of [0, 90, 180, 270]) {
    if (angle) await page.getByRole('button', { name: 'Xoay trang', exact: true }).click();
    await page
      .getByLabel('Mức phóng', { exact: true })
      .selectOption(angle === 180 ? '0.75' : '1.25');
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const a = await overlay.boundingBox();
        const b = await text.evaluate((node, quote: string) => {
          const value = node.firstChild!;
          const start = value.textContent!.indexOf(quote);
          const range = document.createRange();
          range.setStart(value, start);
          range.setEnd(value, start + quote.length);
          const rect = range.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }, list[0].anchor.quote);
        return (
          !!a &&
          !!b &&
          Math.abs(a.x - b.x) < 4 &&
          Math.abs(a.y - b.y) < 4 &&
          Math.abs(a.width - b.width) < 5 &&
          Math.abs(a.height - b.height) < 5
        );
      })
      .toBe(true);
  }
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(overlay).toHaveCount(0);
  await page.getByRole('button', { name: 'Trang trước', exact: true }).click();
  await expect(overlay).toBeVisible();
  await page.reload();
  await expect(overlay).toBeVisible();
  const row = page.getByRole('article', { name: `Vùng tô ${id}`, exact: true });
  await expect(row.getByText('Điểm cần nhớ <b>riêng tư</b>', { exact: true })).toBeVisible();
  expect(await row.locator('b').count()).toBe(0);
  // Click through the overlay into the PDF text, then edit the existing selection.
  const hit = (await overlay.boundingBox())!;
  await page.mouse.click(hit.x + hit.width / 2, hit.y + hit.height / 2);
  await expect(editor).toHaveValue('Điểm cần nhớ <b>riêng tư</b>');
  await editor.fill('Đã sửa vùng tô');
  await page.getByLabel('Màu tô sáng', { exact: true }).selectOption('#A5D6A7');
  await page.getByRole('button', { name: 'Lưu vùng tô', exact: true }).click();
  await expect(row.getByText('Đã sửa vùng tô', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 900 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  if (process.env.CAPTURE_HIGHLIGHTS_UI === '1') {
    mkdirSync('.impeccable/review/highlights', { recursive: true });
    await row.getByRole('button', { name: 'Sửa vùng tô', exact: true }).click();
    for (const [name, width, height] of [
      ['mobile', 360, 900],
      ['tablet', 768, 1000],
      ['desktop', 1440, 1100],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect(overlay).toBeVisible();
      expect(
        await page.evaluate(() => {
          const toolbar = document
            .querySelector('.reader-highlight-tools')!
            .getBoundingClientRect();
          const region = document
            .querySelector('.reader-highlight-region')!
            .getBoundingClientRect();
          return toolbar.bottom <= region.bottom + 2;
        }),
      ).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `.impeccable/review/highlights/${name}.png`, fullPage: true });
    }
    await page.getByRole('button', { name: 'Hủy vùng tô', exact: true }).click();
  }
  await row.getByRole('button', { name: 'Xóa vùng tô', exact: true }).click();
  await row.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await expect(overlay).toHaveCount(0);
  expect((await (await page.request.get(`${path}/highlights?pageNumber=1`)).json()).items).toEqual(
    [],
  );
});

test('highlights load all cursor pages, retry failures and retain a stale draft on its original page', async ({
  page,
}) => {
  test.setTimeout(90000);
  const path = await openPersonalReader(page, 'e2e-highlights-list');
  const token = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
  const headers = { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': token };
  const anchor = {
    coordinateSpace: 'normalized-pdf-v1',
    quote: 'HUCEScholar reader fixture',
    quads: [[0.1, 0.9, 0.5, 0.9, 0.5, 0.85, 0.1, 0.85]],
  };
  const results = await Promise.all(
    Array.from({ length: 31 }, (_, i) =>
      page.request.post(`${path}/highlights`, {
        headers,
        data: {
          pageNumber: 1,
          anchor,
          content: `Ghi chú ${i}`,
          color: '#FFF59D',
          requestId: crypto.randomUUID(),
        },
      }),
    ),
  );
  expect(results.every((r) => r.status() === 201)).toBe(true);
  const target = (await results[0].json()).item;
  await page.getByRole('button', { name: 'Tải lại vùng tô', exact: true }).click();
  await expect(page.locator('[data-highlight-id]')).toHaveCount(31);
  await page.route('**/api/v1/library/versions/*/highlights?**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await page.getByRole('button', { name: 'Tải lại vùng tô', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Chưa tải được vùng tô' })).toBeVisible();
  await expect(page.locator('[data-highlight-id]')).toHaveCount(0);
  await page.unroute('**/api/v1/library/versions/*/highlights?**');
  await page.getByRole('button', { name: 'Tải lại vùng tô', exact: true }).click();
  await expect(page.locator('[data-highlight-id]')).toHaveCount(31);
  const row = page.getByRole('article', { name: `Vùng tô ${target.id}`, exact: true });
  await row.getByRole('button', { name: 'Sửa vùng tô', exact: true }).click();
  const editor = page.getByLabel('Ghi chú cho đoạn tô', { exact: true });
  await editor.fill('Bản soạn tab hiện tại');
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Sửa vùng tô · Trang 1', exact: true }),
  ).toBeVisible();
  await expect(editor).toHaveValue('Bản soạn tab hiện tại');
  expect(
    (
      await page.request.patch(`${path}/highlights/${target.id}`, {
        headers,
        data: { revision: 1, content: 'Đã sửa ở tab khác', color: '#90CAF9' },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Lưu vùng tô', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Vùng tô đã thay đổi' })).toBeVisible();
  await expect(editor).toHaveValue('Bản soạn tab hiện tại');
  await page.getByRole('button', { name: 'Trang trước', exact: true }).click();
  await expect(row.getByText('Đã sửa ở tab khác', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hủy vùng tô', exact: true }).click();
  await row.getByRole('button', { name: 'Sửa vùng tô', exact: true }).click();
  await expect(editor).toHaveValue('Đã sửa ở tab khác');
  await page.getByRole('button', { name: 'Hủy vùng tô', exact: true }).click();
});

for (const historyMode of ['native', 'legacy'] as const) {
  test(`reader draft survives cancelled browser back and forward without adding history entries (${historyMode})`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    if (historyMode === 'legacy') {
      await page.addInitScript(() => {
        Object.defineProperty(window, 'navigation', { value: undefined });
      });
    }
    const path = await openPersonalReader(page, 'e2e-notes');
    const readerUrl = path.replace('/api/v1', '/workspace');
    // Real Next links create same-document history; page.goto would only test beforeunload.
    await page.getByRole('link', { name: 'Về kho học liệu', exact: true }).click();
    await page.locator(`a[href="${readerUrl}"]`).click();
    const editor = page.getByLabel('Nội dung ghi chú', { exact: true });
    await expect(editor).toBeVisible();
    const historyLength = await page.evaluate(() => history.length);
    await editor.fill('Bản soạn cần giữ khi quay lại');
    expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain(
      'Bản soạn cần giữ',
    );
    let prompts = 0;
    const dismiss = async (dialog: import('@playwright/test').Dialog) => {
      prompts++;
      await dialog.dismiss();
    };
    page.on('dialog', dismiss);
    // A pending framework write can arrive while popstate is returning to the reader.
    // Keep its opaque state intact and ensure it cannot overwrite the traversed-to index.
    await page.evaluate(() => {
      const state = history.state;
      const go = history.go;
      history.go = function (delta) {
        history.go = go;
        history.replaceState(state, '');
        go.call(history, delta);
      };
    });
    await page.evaluate(() => history.back());
    await expect.poll(() => prompts).toBe(1);
    await expect(page).toHaveURL(readerUrl);
    await expect(editor).toHaveValue('Bản soạn cần giữ khi quay lại');
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    await page.evaluate(() => history.back());
    await expect.poll(() => prompts).toBe(2);
    await expect(page).toHaveURL(readerUrl);
    await expect(editor).toHaveValue('Bản soạn cần giữ khi quay lại');
    await page.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
    await page.getByRole('link', { name: 'Về kho học liệu', exact: true }).click();
    await expect(page).toHaveURL('/workspace/library');
    await page.goBack();
    await expect(page).toHaveURL(readerUrl);
    await expect(editor).toBeVisible();
    await editor.fill('Bản soạn cần giữ khi tiến tới');
    await page.evaluate(() => history.forward());
    await expect.poll(() => prompts).toBe(3);
    await expect(page).toHaveURL(readerUrl);
    await expect(editor).toHaveValue('Bản soạn cần giữ khi tiến tới');
    expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
    page.off('dialog', dismiss);
    page.once('dialog', (dialog) => dialog.accept());
    await page.goForward();
    await expect(page).toHaveURL('/workspace/library');
    await expect(editor).toHaveCount(0);
  });
}

test('reader history guard handles fragments, multi-entry traversal and an in-flight save', async ({
  page,
}) => {
  test.setTimeout(90000);
  const path = await openPersonalReader(page, 'e2e-notes');
  const readerUrl = path.replace('/api/v1', '/workspace');
  await page.getByRole('link', { name: 'Về kho học liệu', exact: true }).click();
  await expect(page).toHaveURL('/workspace/library');
  await page.getByRole('link', { name: 'Thư viện của tôi', exact: true }).click();
  await expect(page).toHaveURL('/workspace/personal-library');
  await page.getByRole('link', { name: 'Kho học liệu', exact: true }).click();
  await page.locator(`a[href="${readerUrl}"]`).click();
  await expect(page.getByLabel('Nội dung ghi chú', { exact: true })).toBeVisible();
  // Reload must retain the indices of earlier Next entries, without persisting the draft.
  await page.reload();
  const editor = page.getByLabel('Nội dung ghi chú', { exact: true });
  await editor.fill('Bản soạn khi chuyển nhiều bước');
  let prompts = 0;
  page.on('dialog', async (dialog) => {
    prompts++;
    await dialog.dismiss();
  });
  await page.evaluate(() => {
    location.hash = 'khong-gian';
  });
  await expect(page).toHaveURL(`${readerUrl}#khong-gian`);
  const length = await page.evaluate(() => history.length);
  await page.evaluate(() => history.go(-3));
  await expect.poll(() => prompts).toBe(1);
  await expect(page).toHaveURL(`${readerUrl}#khong-gian`);
  await expect(editor).toHaveValue('Bản soạn khi chuyển nhiều bước');
  expect(await page.evaluate(() => history.length)).toBe(length);
  // Hash-only traversal stays in the reader and does not ask to discard the draft.
  await page.goBack();
  await expect(page).toHaveURL(readerUrl);
  expect(prompts).toBe(1);
  await expect(editor).toHaveValue('Bản soạn khi chuyển nhiều bước');
  await page.goForward();
  await expect(page).toHaveURL(`${readerUrl}#khong-gian`);
  await expect(editor).toHaveValue('Bản soạn khi chuyển nhiều bước');
  await page.goBack();
  await expect(page).toHaveURL(readerUrl);

  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saving = false;
  await page.route('**/api/v1/library/versions/*/notes', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    saving = true;
    await held;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
  await expect.poll(() => saving).toBe(true);
  let traversals = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) traversals++;
  });
  try {
    await page.evaluate(() => history.go(-2));
    await expect.poll(() => traversals).toBeGreaterThanOrEqual(2);
    await expect(page).toHaveURL(readerUrl);
    await expect(editor).toHaveValue('Bản soạn khi chuyển nhiều bước');
    expect(prompts).toBe(1);
  } finally {
    release();
  }
  await expect(editor).toHaveValue('');
  await expect(editor).toBeEditable();
  await page.evaluate(() => history.go(-2));
  await expect(page).toHaveURL('/workspace/personal-library');
  expect(prompts).toBe(1);
  const notes = (await (await page.request.get(`${path}/notes?pageNumber=1`)).json()).items;
  expect(notes).toHaveLength(1);
  expect(notes[0].content).toBe('Bản soạn khi chuyển nhiều bước');
});

test('private page notes preserve drafts, recover lost responses and reject stale edits', async ({
  page,
}) => {
  test.setTimeout(90000);
  const path = await openPersonalReader(page, 'e2e-notes');
  const editor = page.getByLabel('Nội dung ghi chú', { exact: true });
  await expect(editor).toBeVisible();
  await editor.fill('Ghi chú riêng <b>không phải HTML</b>');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Về kho học liệu', exact: true }).click();
  await expect(editor).toHaveValue('Ghi chú riêng <b>không phải HTML</b>');
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Ghi chú đang soạn · Trang 1', exact: true }),
  ).toBeVisible();
  await page.route('**/api/v1/library/versions/*/notes', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fetch();
    await route.abort();
  });
  await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Chưa xác nhận được lần lưu' }),
  ).toBeVisible();
  await expect(editor).toHaveValue('Ghi chú riêng <b>không phải HTML</b>');
  await page.unroute('**/api/v1/library/versions/*/notes');
  await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
  await expect(editor).toHaveValue('');
  let notes = (await (await page.request.get(`${path}/notes?pageNumber=1`)).json()).items;
  expect(notes).toHaveLength(1);
  await page.getByRole('button', { name: 'Trang trước', exact: true }).click();
  const row = page.getByRole('article', { name: `Ghi chú ${notes[0].id}` });
  await expect(
    row.getByText('Ghi chú riêng <b>không phải HTML</b>', { exact: true }),
  ).toBeVisible();
  expect(await row.locator('b').count()).toBe(0);
  await row.getByRole('button', { name: 'Sửa', exact: true }).click();
  await editor.fill('Bản soạn ở tab hiện tại');
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
  expect(
    (
      await page.request.patch(`${path}/notes/${notes[0].id}`, {
        headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf },
        data: { revision: 1, content: 'Đã sửa ở tab khác' },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Ghi chú đã thay đổi' })).toBeVisible();
  await expect(editor).toHaveValue('Bản soạn ở tab hiện tại');
  await page.getByRole('button', { name: 'Tải lại ghi chú', exact: true }).click();
  await expect(row.getByText('Đã sửa ở tab khác', { exact: true })).toBeVisible();
  await expect(editor).toHaveValue('Bản soạn ở tab hiện tại');
  await page.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
  await row.getByRole('button', { name: 'Sửa', exact: true }).click();
  await editor.fill('Ghi chú đã chỉnh sửa');
  await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
  await expect(editor).toHaveValue('');
  await page.reload();
  await expect(page.getByLabel('Số trang', { exact: true })).toBeEnabled();
  await page.getByLabel('Số trang', { exact: true }).fill('1');
  await expect(row.getByText('Ghi chú đã chỉnh sửa', { exact: true })).toBeVisible();
  if (process.env.CAPTURE_READING_UI === '1') {
    mkdirSync('.impeccable/review/reading', { recursive: true });
    for (const [name, width, height] of [
      ['desktop', 1440, 1100],
      ['tablet', 768, 1100],
      ['mobile', 360, 1000],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect(
        page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
      ).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      await page.screenshot({
        path: `.impeccable/review/reading/${name}-notes.png`,
        fullPage: true,
      });
    }
  }
  await row.getByRole('button', { name: 'Sửa', exact: true }).click();
  await editor.fill('Giữ bản soạn khi reader lỗi');
  await page.route('**/api/v1/library/versions/*', (route) => route.abort());
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Thử mở lại PDF', exact: true })).toBeVisible();
  await expect(editor).toHaveValue('Giữ bản soạn khi reader lỗi');
  await page.unroute('**/api/v1/library/versions/*');
  await page.getByRole('button', { name: 'Thử mở lại PDF', exact: true }).click();
  await expect(editor).toHaveValue('Giữ bản soạn khi reader lỗi');
  await page.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
  await expect(page.getByLabel('Số trang', { exact: true })).toBeEnabled();
  await page.getByLabel('Số trang', { exact: true }).fill('1');
  await row.getByRole('button', { name: 'Xóa', exact: true }).click();
  const beforeDelete = (await (await page.request.get(`${path}/notes?pageNumber=1`)).json())
    .items[0];
  expect(
    (
      await page.request.patch(`${path}/notes/${beforeDelete.id}`, {
        headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf },
        data: { revision: beforeDelete.revision, content: 'Đã đổi trước khi xóa' },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Tải lại danh sách trước khi xóa' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tải lại ghi chú', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xác nhận xóa', exact: true })).toHaveCount(0);
  await expect(row.getByText('Đã đổi trước khi xóa', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await expect(row).toHaveCount(0);
  notes = (await (await page.request.get(`${path}/notes?pageNumber=1`)).json()).items;
  expect(notes).toEqual([]);
});
test('reader resumes saved pages and never overwrites progress after network failure or conflict', async ({
  page,
}) => {
  test.setTimeout(90000);
  const path = await openPersonalReader(page, 'e2e-progress');
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu tiến độ · Trang 1' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu tiến độ · Trang 2' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Số trang', { exact: true })).toHaveValue('2');
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' }),
  ).toBeVisible();
  await page.route('**/api/v1/library/versions/*/progress', (route) =>
    route.request().method() === 'PUT' ? route.abort() : route.continue(),
  );
  await page.getByRole('button', { name: 'Trang trước', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Chưa xác nhận được tiến độ' }),
  ).toBeVisible();
  expect((await (await page.request.get(`${path}/progress`)).json()).item.pageNumber).toBe(2);
  await page.unroute('**/api/v1/library/versions/*/progress');
  await page.getByRole('button', { name: 'Thử lưu tiến độ', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu tiến độ · Trang 1' }),
  ).toBeVisible();
  const current = (await (await page.request.get(`${path}/progress`)).json()).item;
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
  expect(
    (
      await page.request.put(`${path}/progress`, {
        headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf },
        data: { revision: current.revision, pageNumber: 2 },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Tiến độ đã thay đổi ở tab khác' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tải lại tiến độ', exact: true }).click();
  await expect(page.getByLabel('Số trang', { exact: true })).toHaveValue('2');
  expect((await (await page.request.get(`${path}/progress`)).json()).item.revision).toBe(
    current.revision + 1,
  );
  await page.route('**/api/v1/library/versions/*/progress', (route) =>
    route.request().method() === 'GET' ? route.abort() : route.continue(),
  );
  let writes = 0;
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().endsWith('/progress')) writes++;
  });
  await page.reload();
  await expect(page.getByRole('alert').filter({ hasText: 'Chưa tải được tiến độ' })).toBeVisible();
  await page.getByRole('button', { name: 'Đọc từ trang 1, chưa lưu tiến độ', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' }),
  ).toBeVisible();
  expect(writes).toBe(0);
  await page.unroute('**/api/v1/library/versions/*/progress');
});
test('admin approves with rights confirmation and recovers a committed decision after response loss', async ({
  page,
}) => {
  test.setTimeout(90000);
  const { code, id } = await submittedForReview(page, 'student');
  await adminReviewLogin(page, code);
  await expect(page.getByRole('heading', { name: 'Chi tiết yêu cầu', exact: true })).toBeVisible();
  const preview = page.getByRole('link', { name: /Mở PDF để kiểm duyệt/ });
  const previewPath = (await preview.getAttribute('href'))!;
  const directPreview = await page.request.get('http://127.0.0.1:3101' + previewPath);
  expect(directPreview.status()).toBe(200);
  expect((await directPreview.body()).length).toBe(
    Number(directPreview.headers()['content-length']),
  );
  expect((await page.request.get(previewPath)).status()).toBe(200);
  await page.getByLabel('Quyết định', { exact: true }).selectOption('APPROVED');
  await page
    .getByLabel('Lý do quyết định', { exact: true })
    .fill('Đã xem PDF, nguồn và căn cứ minh họa');
  await expect(
    page.getByRole('button', { name: 'Xác nhận quyết định', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Đã kiểm tra nội dung và căn cứ quyền sử dụng', { exact: true }).check();
  if (process.env.CAPTURE_MODERATION_UI === '1') {
    mkdirSync('.impeccable/review/moderation', { recursive: true });
    for (const [device, width, height] of [
      ['desktop', 1440, 1000],
      ['tablet', 768, 1024],
      ['mobile', 360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `.impeccable/review/moderation/${device}-pending.png`,
        fullPage: true,
      });
    }
  }
  await page.route('**/api/v1/admin/publication-requests/*/decision', async (route) => {
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Xác nhận quyết định', exact: true }).click();
  await page.getByRole('button', { name: 'Lưu quyết định', exact: true }).click();
  await expect(page.locator('.moderation-detail [role="alert"]')).toContainText(
    'Tải trạng thái yêu cầu',
  );
  await expect(page.getByLabel('Lý do quyết định', { exact: true })).toHaveValue(
    'Đã xem PDF, nguồn và căn cứ minh họa',
  );
  await expect(page.getByRole('button', { name: 'Lưu quyết định', exact: true })).toBeDisabled();
  if (process.env.CAPTURE_MODERATION_UI === '1')
    for (const [device, width, height] of [
      ['desktop', 1440, 1000],
      ['tablet', 768, 1024],
      ['mobile', 360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `.impeccable/review/moderation/${device}-retry.png`,
        fullPage: true,
      });
    }
  await page.unroute('**/api/v1/admin/publication-requests/*/decision');
  await page.getByRole('button', { name: 'Tải trạng thái yêu cầu', exact: true }).click();
  await expect(page.locator('.moderation-detail')).toContainText('Đã duyệt');
  await expect(page.locator('.moderation-detail')).toContainText('Bản hiện hành');
  await logoutForTest(page);
  await login(page, 'student');
  await page.getByLabel('Trạng thái duyệt', { exact: true }).selectOption('APPROVED');
  await page.getByLabel('Tìm bản nháp', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page
    .getByRole('button', { name: `Mở bản nháp Học liệu minh họa ${code}`, exact: true })
    .click();
  await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toBeDisabled();
  await expect(
    page
      .getByRole('region', { name: 'Yêu cầu duyệt', exact: true })
      .locator('.publication-history'),
  ).toContainText('Đã duyệt');
  expect(
    (await (await page.request.get(`/api/v1/material-drafts/${id}`)).json()).item.reviewStatus,
  ).toBe('APPROVED');
});
test('lecturer reopens a legacy change request, self-publishes and retains older request history', async ({
  page,
}) => {
  test.setTimeout(60000);
  const { code } = await submittedForReview(page, 'lecturer');
  await adminReviewLogin(page, code);
  await page.getByLabel('Quyết định', { exact: true }).selectOption('CHANGES_REQUIRED');
  await page
    .getByLabel('Lý do quyết định', { exact: true })
    .fill('Bổ sung dẫn chứng quyền sử dụng');
  await page.goBack();
  await expect(page).toHaveURL('/workspace/admin');
  await page.goForward();
  await page.getByLabel('Tìm yêu cầu', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page
    .getByRole('button', { name: `Xem yêu cầu Học liệu minh họa ${code}`, exact: true })
    .click();
  await expect(page.getByLabel('Lý do quyết định', { exact: true })).toHaveValue(
    'Bổ sung dẫn chứng quyền sử dụng',
  );
  await expect(page.getByLabel('Quyết định', { exact: true })).toHaveValue('CHANGES_REQUIRED');
  await page.getByRole('button', { name: 'Xác nhận quyết định', exact: true }).click();
  await page.getByRole('button', { name: 'Lưu quyết định', exact: true }).click();
  await expect(page.locator('.moderation-detail')).toContainText('Đã lưu quyết định');
  await logoutForTest(page);
  await login(page, 'lecturer');
  await page.getByLabel('Trạng thái công bố', { exact: true }).selectOption('CHANGES_REQUIRED');
  await page.getByLabel('Tìm bản nháp', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page
    .getByRole('button', { name: `Mở bản nháp Học liệu minh họa ${code}`, exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Công bố tài liệu', exact: true })
      .locator('.publication-history'),
  ).toContainText('Bổ sung dẫn chứng quyền sử dụng');
  await page.getByRole('button', { name: 'Mở lại để chỉnh sửa', exact: true }).click();
  await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Công bố', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận công bố', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã công bố tài liệu' })).toBeVisible();
  await page.getByRole('button', { name: 'Tạo phiên bản kế tiếp', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận tạo phiên bản', exact: true }).click();
  await page.getByRole('button', { name: 'Xem lịch sử yêu cầu phiên bản 1', exact: true }).click();
  await expect(page.getByText('Bổ sung dẫn chứng quyền sử dụng', { exact: true })).toBeVisible();
});
for (const role of ['student', 'lecturer'] as const)
  test(`${role} can withdraw a pending review with a retained reason and history`, async ({
    page,
  }) => {
    const actionLabel = role === 'lecturer' ? 'Công bố' : 'Gửi duyệt';
    const refreshLabel = role === 'lecturer' ? 'Tải trạng thái công bố' : 'Tải trạng thái duyệt';
    const code = await seed(page, role);
    await login(page, role);
    await fill(page, code);
    await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
    await page.getByLabel('Tìm bản nháp', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
    await page
      .getByRole('button', { name: `Mở bản nháp Học liệu minh họa ${code}`, exact: true })
      .click();
    await expect(page.getByRole('button', { name: actionLabel, exact: true })).toBeDisabled();
    await page.getByLabel('Chọn PDF', { exact: true }).setInputFiles({
      name: 'synthetic-publication.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\nSynthetic publication fixture'),
    });
    await page.getByRole('button', { name: 'Tải PDF lên', exact: true }).click();
    await expect(page.getByText('Lần lưu 2', { exact: false })).toBeVisible();
    const item = (await (await page.request.get('/api/v1/material-drafts?search=' + code)).json())
      .items[0];
    await markSyntheticSafe(item.id);
    await page.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).click();
    await page.getByLabel('Tác giả', { exact: false }).fill('Chưa lưu');
    await expect(page.getByRole('button', { name: actionLabel, exact: true })).toBeDisabled();
    await page.getByLabel('Tác giả', { exact: false }).fill('Tác giả kiểm thử');
    if (role === 'lecturer') {
      // Compatibility: a lecturer's pending request created before self-publication can still be withdrawn.
      const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
      const legacy = await page.request.patch(`/api/v1/material-drafts/${item.id}`, {
        headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf },
        data: {
          title: item.title,
          authors: item.authors,
          description: item.description,
          materialType: item.materialType,
          sourceReference: 'Synthetic legacy source',
          rightsBasis: 'Synthetic legacy declaration',
          downloadAllowed: item.downloadAllowed,
          courseIds: item.courses.map((c: { id: string }) => c.id),
          revision: item.revision,
        },
      });
      expect(legacy.status()).toBe(200);
      const legacyRevision = (await legacy.json()).item.revision;
      expect(
        (
          await page.request.post(`/api/v1/material-drafts/${item.id}/submit`, {
            headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf },
            data: { revision: legacyRevision },
          })
        ).status(),
      ).toBe(201);
      await page.getByRole('button', { name: refreshLabel, exact: true }).click();
      await expect(page.getByRole('button', { name: 'Rút về nháp', exact: true })).toBeVisible();
    } else {
      await page.getByRole('button', { name: 'Gửi duyệt', exact: true }).click();
      await page.getByRole('button', { name: 'Xác nhận gửi duyệt', exact: true }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Đã gửi yêu cầu duyệt' }),
      ).toBeVisible();
    }
    await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('Chọn PDF', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Rút về nháp', exact: true })).toBeDisabled();
    if (role === 'student' && process.env.CAPTURE_PUBLICATION_UI === '1') {
      mkdirSync('.impeccable/review/publication', { recursive: true });
      for (const [device, width, height] of [
        ['desktop', 1440, 1000],
        ['tablet', 768, 1024],
        ['mobile', 360, 800],
      ] as const) {
        await page.setViewportSize({ width, height });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `.impeccable/review/publication/${device}-submitted.png`,
          fullPage: true,
        });
        await page
          .locator('.publication-actions')
          .screenshot({ path: `.impeccable/review/publication/${device}-submitted-detail.png` });
      }
    }
    await page
      .getByLabel('Lý do rút yêu cầu', { exact: true })
      .fill('Bổ sung nguồn tài liệu trước khi duyệt');
    await page.getByRole('button', { name: 'Đóng bản nháp', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Xác nhận bỏ thay đổi' })).toBeVisible();
    await page.getByRole('button', { name: 'Tiếp tục sửa', exact: true }).click();
    await page.route('**/api/v1/material-drafts/*/withdraw', (route) => route.abort('failed'));
    await page.getByRole('button', { name: 'Rút về nháp', exact: true }).click();
    await expect(page.locator('.publication-actions [role="alert"]')).toContainText(refreshLabel);
    await expect(page.getByLabel('Lý do rút yêu cầu', { exact: true })).toHaveValue(
      'Bổ sung nguồn tài liệu trước khi duyệt',
    );
    await expect(page.getByRole('button', { name: 'Rút về nháp', exact: true })).toBeDisabled();
    if (role === 'student' && process.env.CAPTURE_PUBLICATION_UI === '1') {
      for (const [device, width, height] of [
        ['desktop', 1440, 1000],
        ['tablet', 768, 1024],
        ['mobile', 360, 800],
      ] as const) {
        await page.setViewportSize({ width, height });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `.impeccable/review/publication/${device}-retry.png`,
          fullPage: true,
        });
        await page
          .locator('.publication-actions')
          .screenshot({ path: `.impeccable/review/publication/${device}-retry-detail.png` });
      }
    }
    await page.unroute('**/api/v1/material-drafts/*/withdraw');
    await page.getByRole('button', { name: refreshLabel, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Rút về nháp', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Rút về nháp', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Đã rút về bản nháp' })).toBeVisible();
    await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toBeEnabled();
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: 'Lý do: Bổ sung nguồn tài liệu trước khi duyệt' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Đóng bản nháp', exact: true }).click();
    await page
      .getByLabel(role === 'lecturer' ? 'Trạng thái công bố' : 'Trạng thái duyệt', { exact: true })
      .selectOption('SUBMITTED');
    await page.getByLabel('Tìm bản nháp', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
    await expect(
      page.getByRole('button', { name: `Mở bản nháp Học liệu minh họa ${code}`, exact: true }),
    ).toHaveCount(0);
  });
test('student attaches a synthetic private PDF and sees its technical status', async ({ page }) => {
  const code = await seed(page, 'student');
  await login(page, 'student');
  await fill(page, code);
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await page
    .getByRole('button', { name: `Mở bản nháp Học liệu minh họa ${code}`, exact: true })
    .click();
  await page.getByLabel('Chọn PDF', { exact: true }).setInputFiles({
    name: 'synthetic.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nSynthetic test PDF'),
  });
  await page.getByLabel('Tác giả', { exact: false }).fill('Thay đổi sau khi chọn file');
  await page.getByRole('button', { name: 'Bỏ file đã chọn', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lưu bản nháp', exact: true })).toBeEnabled();
  await page.getByLabel('Tác giả', { exact: false }).fill('Tác giả kiểm thử');
  await page.getByLabel('Chọn PDF', { exact: true }).setInputFiles({
    name: 'synthetic.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nSynthetic test PDF'),
  });
  await page.getByRole('button', { name: 'Tải PDF lên', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'PDF đang kiểm tra' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: code })).toContainText('PDF đang kiểm tra');
  await expect(page.getByText('synthetic.pdf', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Lần lưu 2', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Đọc PDF', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const response = await page.request.get('/api/v1/material-drafts?search=' + code);
  const item = (await response.json()).items[0];
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
  expect(
    (
      await page.request.patch(`/api/v1/material-drafts/${item.id}`, {
        headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf },
        data: {
          title: item.title,
          authors: 'Tác giả ở tab khác',
          description: item.description,
          materialType: item.materialType,
          sourceReference: item.sourceReference,
          rightsBasis: item.rightsBasis,
          downloadAllowed: item.downloadAllowed,
          courseIds: item.courses.map((c: { id: string }) => c.id),
          revision: item.revision,
        },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).click();
  await expect(page.getByLabel('Tác giả', { exact: false })).toHaveValue('Tác giả ở tab khác');
  await capture(page, 'draft-pdf-checking');
  await page.getByLabel('Chọn PDF', { exact: true }).setInputFiles({
    name: 'retry.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nSynthetic retry'),
  });
  await page.route('**/material-drafts/*/pdf', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'UPLOAD_UNCERTAIN' }),
    }),
  );
  await page.getByRole('button', { name: 'Tải PDF lên', exact: true }).click();
  await expect(page.locator('.draft-pdf [role="alert"]')).toContainText(
    'Chưa xác nhận được kết quả upload',
  );
  await expect(page.getByLabel('Tác giả', { exact: false })).toHaveValue('Tác giả ở tab khác');
  await expect(page.getByRole('button', { name: 'Tải PDF lên', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Bỏ file đã chọn', exact: true }).click();
  await expect(page.locator('.draft-pdf [role="alert"]')).toContainText('Cập nhật trạng thái');
  await page.getByLabel('Chọn PDF', { exact: true }).setInputFiles({
    name: 'retry-again.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nSynthetic retry again'),
  });
  await expect(page.locator('.draft-pdf [role="alert"]')).toContainText('Cập nhật trạng thái');
  await expect(page.getByRole('button', { name: 'Tải PDF lên', exact: true })).toBeDisabled();
  await capture(page, 'draft-pdf-retry');
  await page.unroute('**/material-drafts/*/pdf');
  await page.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).click();
  await expect(page.locator('.draft-pdf [role="alert"]')).toHaveCount(0);
});
async function capture(page: Page, name: string) {
  if (
    process.env.CAPTURE_MATERIALS_UI !== '1' &&
    !(process.env.CAPTURE_PDF_UI === '1' && name.startsWith('draft-pdf'))
  )
    return;
  mkdirSync('.impeccable/review/materials', { recursive: true });
  for (const [device, width, height] of [
    ['desktop', 1440, 1000],
    ['tablet', 768, 1024],
    ['mobile', 360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `.impeccable/review/materials/${name}-${device}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}
test('lecturer creates, reloads and edits an owned draft without claiming a PDF exists', async ({
  page,
}) => {
  const code = await seed(page, 'lecturer');
  await login(page, 'lecturer');
  await fill(page, code);
  await capture(page, 'draft-editor');
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu bản nháp' })).toBeVisible();
  await page.getByLabel('Tìm bản nháp', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: code })).toContainText('Chưa có PDF');
  await capture(page, 'draft-list');
  await page.reload();
  await page.getByLabel('Tìm bản nháp', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page
    .getByRole('button', { name: `Mở bản nháp Học liệu minh họa ${code}`, exact: true })
    .click();
  await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toHaveValue(
    `Học liệu minh họa ${code}`,
  );
  await page.getByLabel('Tiêu đề học liệu', { exact: true }).fill(`Đã sửa ${code}`);
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu bản nháp' })).toBeVisible();
});
test('student keeps entered draft after stale conflict and explicitly discards changes', async ({
  page,
}) => {
  const code = await seed(page, 'student');
  await login(page, 'student');
  await fill(page, code);
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu bản nháp' })).toBeVisible();
  await page.getByLabel('Tìm bản nháp', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: code })).toContainText('Sinh viên bổ sung');
  await page
    .getByRole('button', { name: `Mở bản nháp Học liệu minh họa ${code}`, exact: true })
    .click();
  await page.getByLabel('Tiêu đề học liệu', { exact: true }).fill('Bản sửa chưa lưu');
  await page.route('**/api/v1/material-drafts/*', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'STALE_REVISION' }),
        })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Bản sửa của bạn được giữ lại' }),
  ).toBeVisible();
  await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toHaveValue(
    'Bản sửa chưa lưu',
  );
  await page.getByRole('link', { name: 'Tài khoản của tôi', exact: true }).click();
  await expect(page.getByText('Bỏ thay đổi chưa lưu?', { exact: true })).toBeVisible();
  await expect(page).toHaveURL('/workspace/student/materials');
  await capture(page, 'draft-conflict');
  await page.getByRole('button', { name: 'Tiếp tục sửa', exact: true }).click();
  await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toHaveValue(
    'Bản sửa chưa lưu',
  );
  await page.getByRole('button', { name: 'Đóng bản nháp', exact: true }).click();
  await expect(page.getByText('Bỏ thay đổi chưa lưu?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục sửa', exact: true }).click();
  await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toHaveValue(
    'Bản sửa chưa lưu',
  );
  await page.getByRole('button', { name: 'Đóng bản nháp', exact: true }).click();
  await page.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
  await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tạo bản nháp', exact: true }).click();
  await page.getByLabel('Tiêu đề học liệu', { exact: true }).fill('Không lưu bản này');
  await page.getByRole('link', { name: 'Tài khoản của tôi', exact: true }).click();
  await page.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
  await expect(page).toHaveURL('/workspace/student');
});
test('draft list retries network failure', async ({ page }) => {
  await login(page, 'student');
  await page.route('**/api/v1/material-drafts?*', (route) => route.abort());
  await page.reload();
  await expect(page.getByRole('button', { name: 'Thử tải bản nháp', exact: true })).toBeVisible();
  await page.unroute('**/api/v1/material-drafts?*');
  await page.getByRole('button', { name: 'Thử tải bản nháp', exact: true }).click();
  await expect(page.getByLabel('Tìm bản nháp', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thử tải bản nháp', exact: true })).toHaveCount(0);
});
test('dirty logout confirms before revoking the session', async ({ page }) => {
  await login(page, 'student');
  await page.getByRole('button', { name: 'Tạo bản nháp', exact: true }).click();
  await page.getByLabel('Tiêu đề học liệu', { exact: true }).fill('Bản nháp trước đăng xuất');
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.getByText('Bỏ thay đổi chưa lưu?', { exact: true })).toBeVisible();
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);
  await page.getByRole('button', { name: 'Tiếp tục sửa', exact: true }).click();
  await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toHaveValue(
    'Bản nháp trước đăng xuất',
  );
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await page.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
  await expect(page).toHaveURL('/login');
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
});
