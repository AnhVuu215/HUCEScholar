import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';

test('admin creates a program under a searched faculty and preserves a stale draft', async ({
  page,
}) => {
  const code = `PRG-${randomBytes(5).toString('hex').toUpperCase()}`;
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('e2e-admin@example.test');
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
  await page.getByLabel('Email', { exact: true }).fill('e2e-admin@example.test');
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
