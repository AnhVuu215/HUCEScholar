import { expect, test } from '@playwright/test';

const password = process.env.E2E_PASSWORD;
if (!password) throw new Error('Run pnpm test:setup before browser tests.');

for (const [role, label] of [
  ['ADMIN', 'Quản trị viên'],
  ['LECTURER', 'Giảng viên'],
  ['STUDENT', 'Sinh viên'],
] as const) {
  test(`${role}: login, restore session and logout`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Đăng nhập', exact: true }).click();
    await page.getByLabel('Email').fill(`e2e-${role.toLowerCase()}@example.test`);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL(`/workspace/${role.toLowerCase()}`);
    await expect(
      page.getByRole('heading', { name: `Không gian ${label.toLowerCase()}` }),
    ).toBeVisible();
    await expect(
      page.getByText(`e2e-${role.toLowerCase()}@example.test`, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText(`e2e-${role.toLowerCase()}@example.test`, { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Menu tài khoản', exact: true }).click();
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(page).toHaveURL('/login');
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Tài khoản của bạn' })).toHaveCount(0);
    await page.goto(`/workspace/${role.toLowerCase()}`);
    await expect(page).toHaveURL('/login');
  });
}

test('wrong password preserves email, recovers and cannot grant another role', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('e2e-student@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('invalid-credential');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Email hoặc mật khẩu không đúng.',
  );
  await expect(page.getByLabel('Email')).toHaveValue('e2e-student@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL('/workspace/student');
  await page.goto('/workspace/admin');
  await expect(page.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
  await page.getByRole('link', { name: 'Về không gian của tôi' }).click();
  await expect(page).toHaveURL('/workspace/student');
});

test('network failure keeps the form usable and provides recovery', async ({ page }) => {
  await page.goto('/login');
  await page.route('**/api/v1/auth/csrf', (route) => route.abort('failed'));
  await page.getByLabel('Email').fill('e2e-student@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Không kết nối được');
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeEnabled();
  await page.unroute('**/api/v1/auth/csrf');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL('/workspace/student');
});

for (const [name, width, height] of [
  ['mobile', 360, 800],
  ['tablet', 768, 1024],
  ['desktop', 1440, 1000],
] as const) {
  test(`${name}: login layout and keyboard access`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const email = page.getByLabel('Email');
    await email.focus();
    await expect(email).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Mật khẩu', { exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, 0));
    // Capture only blank credentials; traces are disabled for the whole suite.
    await page.screenshot({ path: `.local/login-${name}.png`, fullPage: true });
  });

  test(`${name}: student workspace reflows with real session`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/login');
    await page.getByLabel('Email').fill('e2e-student@example.test');
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tài khoản của bạn' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.local/workspace-${name}.png`, fullPage: true });
  });
}
