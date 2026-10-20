import { expect, test } from './helpers/test';
import { randomBytes } from 'node:crypto';
import { captureCatalog } from './catalog-capture';

test('admin assigns and revokes a course; lecturer sees only their assignments and history', async ({
  page,
  browser,
}) => {
  const code = `ASG-${randomBytes(5).toString('hex').toUpperCase()}`;
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('e2e-assignments-admin@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL('/workspace/admin');
  const csrf = await (await page.request.get('/api/v1/auth/csrf')).json();
  const headers = { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf.csrfToken };
  const faculty = await (
    await page.request.post('/api/v1/admin/catalog/faculties', {
      headers,
      data: { code, name: 'Khoa kiểm thử phân công' },
    })
  ).json();
  await page.request.post('/api/v1/admin/catalog/courses', {
    headers,
    data: { code, name: 'Môn kiểm thử phân công', facultyId: faculty.item.id },
  });
  await page.getByRole('link', { name: 'Phân công giảng viên', exact: true }).click();
  await page.getByRole('button', { name: 'Phân công giảng viên', exact: true }).click();
  await page.getByLabel('Tìm giảng viên', { exact: true }).fill('e2e-lecturer@example.test');
  const lecturerOption = page
    .getByLabel('Giảng viên phụ trách', { exact: true })
    .getByRole('option')
    .filter({ hasText: 'e2e-lecturer@example.test' });
  await expect(lecturerOption).toBeAttached();
  await page
    .getByLabel('Giảng viên phụ trách', { exact: true })
    .selectOption((await lecturerOption.getAttribute('value'))!);
  await page.getByLabel('Tìm môn học được phân công', { exact: true }).fill(code);
  await expect(
    page
      .getByLabel('Môn học được phân công', { exact: true })
      .getByRole('option', { name: `${code} · Môn kiểm thử phân công`, exact: true }),
  ).toBeAttached();
  await page
    .getByLabel('Môn học được phân công', { exact: true })
    .selectOption({ label: `${code} · Môn kiểm thử phân công` });
  await expect(
    page.getByText(`Đã chọn: ${code} · Môn kiểm thử phân công`, { exact: true }),
  ).toBeVisible();
  await expect(page.locator('#lecturer-selected')).toContainText('e2e-lecturer@example.test');
  await captureCatalog(page, 'assignment-create');
  await page.getByRole('button', { name: 'Lưu phân công', exact: true }).click();
  await expect(
    page.getByRole('main').getByRole('status').filter({ hasText: 'Đã phân công' }),
  ).toBeVisible();
  await page.getByLabel('Tìm phân công', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: code })).toContainText('Hiện hành');
  const context = await browser.newContext();
  try {
    const lecturer = await context.newPage();
    await lecturer.goto('/login');
    await lecturer.getByLabel('Email', { exact: true }).fill('e2e-lecturer@example.test');
    await lecturer.getByLabel('Mật khẩu', { exact: true }).fill(process.env.E2E_PASSWORD!);
    await lecturer.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await lecturer.getByRole('link', { name: 'Phân công của tôi', exact: true }).click();
    await lecturer.getByLabel('Tìm phân công', { exact: true }).fill(code);
    await lecturer.getByRole('button', { name: 'Áp dụng', exact: true }).click();
    await expect(lecturer.getByRole('row').filter({ hasText: code })).toContainText('Hiện hành');
    await expect(lecturer.getByRole('button', { name: /^Thu hồi/ })).toHaveCount(0);
    await page
      .getByRole('button', { name: `Thu hồi ${code} của e2e-lecturer@example.test`, exact: true })
      .click();
    await page
      .getByLabel('Lý do thu hồi', { exact: true })
      .fill('Điều chỉnh phân công học kỳ — dữ liệu kiểm thử');
    await captureCatalog(page, 'assignment-revoke');
    await page.getByRole('button', { name: 'Xác nhận thu hồi', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: code })).toContainText('Đã thu hồi');
    await captureCatalog(page, 'assignment-history');
    await lecturer.reload();
    await lecturer.getByLabel('Tìm phân công', { exact: true }).fill(code);
    await lecturer.getByRole('button', { name: 'Áp dụng', exact: true }).click();
    await expect(lecturer.getByRole('row').filter({ hasText: code })).toContainText('Đã thu hồi');
    await captureCatalog(lecturer, 'lecturer-history');
  } finally {
    await context.close();
  }
});

test('assignment list network error retries without leaving the page', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('e2e-assignments-admin@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL('/workspace/admin');
  await page.route('**/api/v1/admin/assignments?*', (route) => route.abort('failed'));
  await page.goto('/workspace/admin/assignments');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Chưa tải được phân công');
  await page.unroute('**/api/v1/admin/assignments?*');
  await page.getByRole('button', { name: 'Tải lại danh sách', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
});
