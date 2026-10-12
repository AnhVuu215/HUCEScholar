import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';

async function login(page: Page, role: 'lecturer' | 'student') {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(`e2e-drafts-${role}@example.test`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(`/workspace/${role}`);
  await page.getByRole('link', { name: 'Học liệu của tôi', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Học liệu của tôi', exact: true })).toBeVisible();
}
async function seed(page: Page, role: 'lecturer' | 'student') {
  const code = `MAT-${randomBytes(5).toString('hex').toUpperCase()}`;
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
  const headers = { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf };
  expect(
    (
      await page.request.post('/api/v1/auth/login', {
        headers,
        data: { email: 'e2e-drafts-admin@example.test', password: process.env.E2E_PASSWORD! },
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
      await page.request.get('/api/v1/admin/users?search=e2e-drafts-lecturer%40example.test')
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
async function markSyntheticSafe(id: string) {
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
      "UPDATE hucescholar.files SET scan_status='SAFE',checked_at=now(),page_count=1,has_text_layer=true WHERE id=(SELECT file_id FROM hucescholar.document_versions v JOIN hucescholar.users u ON u.id=v.created_by WHERE document_id=$1 AND u.email LIKE 'e2e-drafts-%@example.test')",
      [id],
    );
    expect(result.rowCount).toBe(1);
  } finally {
    await db.end();
  }
}
for (const role of ['student', 'lecturer'] as const)
  test(`${role} can submit and withdraw with a retained reason and history`, async ({ page }) => {
    const code = await seed(page, role);
    await login(page, role);
    await fill(page, code);
    await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
    await page.getByLabel('Tìm bản nháp', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
    await page
      .getByRole('button', { name: `Mở bản nháp Học liệu minh họa ${code}`, exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Gửi duyệt', exact: true })).toBeDisabled();
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
    await expect(page.getByRole('button', { name: 'Gửi duyệt', exact: true })).toBeDisabled();
    await page.getByLabel('Tác giả', { exact: false }).fill('Tác giả kiểm thử');
    if (role === 'lecturer')
      await page.route('**/api/v1/material-drafts/*/submit', async (route) => {
        await route.fetch();
        await route.abort('failed');
      });
    await page.getByRole('button', { name: 'Gửi duyệt', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận gửi duyệt', exact: true }).click();
    if (role === 'lecturer') {
      await expect(page.locator('.publication-actions [role="alert"]')).toContainText(
        'Tải trạng thái duyệt',
      );
      await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toBeDisabled();
      await expect(page.getByLabel('Chọn PDF', { exact: true })).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Tải trạng thái duyệt', exact: true }),
      ).toBeEnabled();
      await page.unroute('**/api/v1/material-drafts/*/submit');
      await page.getByRole('button', { name: 'Tải trạng thái duyệt', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Rút về nháp', exact: true })).toBeVisible();
    } else
      await expect(
        page.getByRole('status').filter({ hasText: 'Đã gửi yêu cầu duyệt' }),
      ).toBeVisible();
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
    await expect(page.locator('.publication-actions [role="alert"]')).toContainText(
      'Tải trạng thái duyệt',
    );
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
    await page.getByRole('button', { name: 'Tải trạng thái duyệt', exact: true }).click();
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
    await page.getByLabel('Trạng thái duyệt', { exact: true }).selectOption('SUBMITTED');
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
