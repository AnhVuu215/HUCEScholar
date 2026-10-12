import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { captureCatalog } from './catalog-capture';

test('admin creates a course and links/unlinks a program from another faculty', async ({
  page,
}) => {
  const code = `CRS-${randomBytes(5).toString('hex').toUpperCase()}`;
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('e2e-catalog-admin@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL('/workspace/admin');
  const csrf = await (await page.request.get('/api/v1/auth/csrf')).json();
  const headers = { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf.csrfToken };
  const a = await (
    await page.request.post('/api/v1/admin/catalog/faculties', {
      headers,
      data: { code: `${code}-A`, name: 'Khoa phụ trách môn' },
    })
  ).json();
  const b = await (
    await page.request.post('/api/v1/admin/catalog/faculties', {
      headers,
      data: { code: `${code}-B`, name: 'Khoa sử dụng môn' },
    })
  ).json();
  await page.request.post('/api/v1/admin/catalog/programs', {
    headers,
    data: { code, name: 'Ngành dùng chung', facultyId: b.item.id },
  });
  await page.goto('/workspace/admin/catalog/courses');
  await page.getByRole('button', { name: 'Thêm môn học', exact: true }).click();
  await page.getByLabel('Tìm khoa phụ trách', { exact: true }).fill(a.item.code);
  await expect(
    page
      .getByLabel('Khoa phụ trách', { exact: true })
      .getByRole('option', { name: `${a.item.code} · Khoa phụ trách môn`, exact: true }),
  ).toBeAttached();
  await page.getByLabel('Khoa phụ trách', { exact: true }).selectOption(a.item.id);
  await page.getByLabel('Mã môn học', { exact: true }).fill(code);
  await page.getByLabel('Tên môn học', { exact: true }).fill('Môn dùng chung');
  await page.getByRole('button', { name: 'Lưu danh mục', exact: true }).click();
  await expect(
    page.getByRole('main').getByRole('status').filter({ hasText: 'Đã lưu môn học' }),
  ).toBeVisible();
  await page.getByLabel('Tìm môn học', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await page.getByRole('button', { name: `Ngành sử dụng ${code}`, exact: true }).click();
  await page.getByLabel('Tìm ngành sử dụng', { exact: true }).fill(code);
  await expect(
    page
      .getByLabel('Ngành sử dụng', { exact: true })
      .getByRole('option', { name: `${code} · Ngành dùng chung`, exact: true }),
  ).toBeAttached();
  await page
    .getByLabel('Ngành sử dụng', { exact: true })
    .selectOption({ label: `${code} · Ngành dùng chung` });
  await page.getByRole('button', { name: 'Thêm vào danh sách', exact: true }).click();
  await captureCatalog(page, 'course-programs');
  await page.getByRole('button', { name: 'Lưu liên kết', exact: true }).click();
  await expect(
    page.getByRole('main').getByRole('status').filter({ hasText: 'Đã lưu các ngành' }),
  ).toBeVisible();
  await page.getByRole('button', { name: `Ngành sử dụng ${code}`, exact: true }).click();
  await page.getByRole('button', { name: `Gỡ ${code} · Ngành dùng chung`, exact: true }).click();
  await page.getByRole('button', { name: 'Lưu liên kết', exact: true }).click();
  await expect(
    page.getByRole('main').getByRole('status').filter({ hasText: 'Đã lưu các ngành' }),
  ).toBeVisible();
});

test('admin creates a program under a searched faculty and preserves a stale draft', async ({
  page,
}) => {
  const code = `PRG-${randomBytes(5).toString('hex').toUpperCase()}`;
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('e2e-catalog-admin@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('link', { name: 'Danh mục đào tạo', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm khoa', exact: true }).click();
  await page.getByLabel('Mã khoa', { exact: true }).fill(code);
  await page.getByLabel('Tên khoa', { exact: true }).fill('Khoa của ngành kiểm thử');
  await page.getByRole('button', { name: 'Lưu danh mục', exact: true }).click();
  await expect(
    page.getByRole('main').getByRole('status').filter({ hasText: 'Đã lưu khoa' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Ngành', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm ngành', exact: true }).click();
  await page.getByLabel('Tìm khoa phụ trách', { exact: true }).fill(code);
  await expect(
    page
      .getByLabel('Khoa phụ trách', { exact: true })
      .getByRole('option', { name: `${code} · Khoa của ngành kiểm thử`, exact: true }),
  ).toBeAttached();
  await page
    .getByLabel('Khoa phụ trách', { exact: true })
    .selectOption({ label: `${code} · Khoa của ngành kiểm thử` });
  await page.getByLabel('Mã ngành', { exact: true }).fill(code);
  await page.getByLabel('Tên ngành', { exact: true }).fill('Ngành kiểm thử');
  await page.getByRole('button', { name: 'Lưu danh mục', exact: true }).click();
  await expect(
    page.getByRole('main').getByRole('status').filter({ hasText: 'Đã lưu ngành' }),
  ).toBeVisible();
  await page.getByLabel('Tìm ngành', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await page.getByRole('button', { name: `Sửa ${code}`, exact: true }).click();
  await page.getByLabel('Tên ngành', { exact: true }).fill('Bản sửa đang nhập');
  await page.route('**/api/v1/admin/catalog/programs/*', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'STALE_REVISION' }),
        })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Lưu danh mục', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Bản sửa của bạn được giữ lại',
  );
  await expect(page.getByLabel('Tên ngành', { exact: true })).toHaveValue('Bản sửa đang nhập');
  await expect(page.getByRole('button', { name: 'Lưu danh mục', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Bỏ bản sửa và tải lại', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: code })).toContainText('Ngành kiểm thử');
});

test('admin creates, finds, edits and stops a faculty', async ({ page }) => {
  const code = `WEB-${randomBytes(5).toString('hex').toUpperCase()}`;
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('e2e-catalog-admin@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('link', { name: 'Danh mục đào tạo', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm khoa', exact: true }).click();
  await page.getByLabel('Mã khoa', { exact: true }).fill(code.toLowerCase());
  await page.getByLabel('Tên khoa', { exact: true }).fill('Khoa kiểm thử trình duyệt');
  await page.getByRole('button', { name: 'Lưu danh mục', exact: true }).click();
  await expect(
    page.getByRole('main').getByRole('status').filter({ hasText: 'Đã lưu khoa' }),
  ).toBeVisible();
  await page.getByLabel('Tìm khoa', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await page.getByRole('button', { name: `Sửa ${code}`, exact: true }).click();
  await page.getByLabel('Tên khoa', { exact: true }).fill('Khoa đã ngừng');
  await page.getByLabel('Sử dụng danh mục', { exact: true }).selectOption('false');
  await page.getByRole('button', { name: 'Lưu danh mục', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: code })).toContainText('Ngừng sử dụng');
  await page.reload();
  await page.getByLabel('Tìm khoa', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: code })).toContainText('Khoa đã ngừng');
});
