import { expect, test, type Page } from './helpers/test';
import { randomBytes } from 'node:crypto';

const password = process.env.E2E_PASSWORD;
if (!password) throw new Error('Run pnpm test:setup before browser tests.');

async function login(page: Page, role = 'admin') {
  await page.goto('/login');
  await page
    .getByLabel('Email', { exact: true })
    .fill(`e2e-${role === 'admin' ? 'users-admin' : role}@example.test`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(`/workspace/${role}`);
}

test('admin provisions, edits, locks and unlocks a real account', async ({ page, browser }) => {
  const email = `browser-${randomBytes(6).toString('hex')}@example.test`;
  await login(page);
  await page.getByRole('link', { name: 'Quản lý tài khoản', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Quản lý tài khoản', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cấp tài khoản', exact: true }).click();
  await page.getByLabel('Họ và tên', { exact: true }).fill('Sinh viên thử nghiệm');
  await page.getByLabel('Email đăng nhập', { exact: true }).fill(email);
  await page.getByLabel('Vai trò tài khoản', { exact: true }).selectOption('STUDENT');
  await page.getByLabel('Mật khẩu khởi tạo', { exact: true }).fill(password!);
  await page.getByLabel('Tôi đã đối chiếu người dùng với danh sách hợp lệ.').check();
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(
    page.getByRole('main').getByRole('status').filter({ hasText: 'Đã cấp tài khoản' }),
  ).toBeVisible();
  await page.getByLabel('Tìm tài khoản').fill(email);
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toBeVisible();
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await student.goto('/login');
  await student.getByLabel('Email', { exact: true }).fill(email);
  await student.getByLabel('Mật khẩu', { exact: true }).fill(password!);
  await student.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(student).toHaveURL('/workspace/student');
  await row.getByRole('button', { name: 'Sửa Sinh viên thử nghiệm', exact: true }).click();
  await page.getByLabel('Họ và tên', { exact: true }).fill('Sinh viên đã cập nhật');
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(row).toContainText('Sinh viên đã cập nhật');
  await page.reload();
  await page.getByLabel('Tìm tài khoản').fill(email);
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(row).toContainText('Sinh viên đã cập nhật');
  await row.getByRole('button', { name: 'Khóa Sinh viên đã cập nhật', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận khóa', exact: true }).click();
  await expect(row).toContainText('Đã khóa');
  await student.reload();
  await expect(student).toHaveURL('/login');
  await row.getByRole('button', { name: 'Mở khóa Sinh viên đã cập nhật', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận mở khóa', exact: true }).click();
  await expect(row).toContainText('Hoạt động');
  await studentContext.close();
});

test('lecturer and student cannot open admin account management', async ({ page }) => {
  for (const role of ['lecturer', 'student']) {
    await login(page, role);
    await page.goto('/workspace/admin/users');
    await expect(page.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cấp tài khoản', exact: true })).toHaveCount(0);
  }
});

test('list recovers from network failure and has a useful empty state', async ({ page }) => {
  await login(page);
  await page.route('**/api/v1/admin/users?*', (route) => route.abort('failed'));
  await page.goto('/workspace/admin/users');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Chưa tải được danh sách');
  await page.unroute('**/api/v1/admin/users?*');
  await page.getByRole('button', { name: 'Tải lại danh sách', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByLabel('Tìm tài khoản').fill('no-matching-account-7caff9');
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(page.getByText('Không tìm thấy tài khoản phù hợp.')).toBeVisible();
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
});

test('failed create preserves fields; stale edit does not overwrite another change', async ({
  page,
}) => {
  await login(page);
  await page.goto('/workspace/admin/users');
  await page.getByRole('button', { name: 'Cấp tài khoản', exact: true }).click();
  await page.getByLabel('Họ và tên', { exact: true }).fill('Dữ liệu giữ lại');
  await page.getByLabel('Email đăng nhập', { exact: true }).fill('e2e-student@example.test');
  await page.getByLabel('Mật khẩu khởi tạo', { exact: true }).fill(password!);
  await page.getByLabel('Tôi đã đối chiếu người dùng với danh sách hợp lệ.').check();
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Email này đã được sử dụng',
  );
  await expect(page.getByLabel('Họ và tên', { exact: true })).toHaveValue('Dữ liệu giữ lại');
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await page.getByLabel('Tìm tài khoản').fill('e2e-student@example.test');
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await page
    .getByRole('row')
    .filter({ hasText: 'e2e-student@example.test' })
    .getByRole('button', { name: /^Sửa / })
    .click();
  await page.getByLabel('Họ và tên', { exact: true }).fill('Bản đang nhập');
  await page.route('**/api/v1/admin/users/*', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'STALE_REVISION' }),
    }),
  );
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Thông tin đã thay đổi');
  await expect(page.getByLabel('Họ và tên', { exact: true })).toHaveValue('Bản đang nhập');
  await page.unroute('**/api/v1/admin/users/*');
  await page.getByRole('button', { name: 'Tải bản mới để đối chiếu', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Thông tin hiện tại trên hệ thống' }),
  ).toBeVisible();
  await expect(page.getByLabel('Họ và tên', { exact: true })).toHaveValue('Bản đang nhập');
  await expect(page.getByRole('button', { name: 'Lưu thay đổi', exact: true })).toBeDisabled();
  await page.getByLabel('Tôi đã đối chiếu và muốn lưu nội dung đang nhập.').check();
  await expect(page.getByRole('button', { name: 'Lưu thay đổi', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
});

for (const [name, width, height] of [
  ['desktop', 1440, 1000],
  ['tablet', 768, 1024],
  ['mobile', 360, 800],
] as const) {
  test(`${name}: accounts and form reflow with keyboard access`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await login(page);
    await page.goto('/workspace/admin/users');
    await expect(page.getByRole('table')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.local/users-${name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Cấp tài khoản', exact: true }).click();
    await expect(page.getByLabel('Họ và tên', { exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Email đăng nhập', { exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.local/users-form-${name}.png`, fullPage: true });
  });
}
