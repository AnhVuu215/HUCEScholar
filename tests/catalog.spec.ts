import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';

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
