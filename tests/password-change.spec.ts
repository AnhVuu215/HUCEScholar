import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readerHeaders } from './helpers/reader-session';
async function login(page: Page, account: string, supplied = process.env.E2E_PASSWORD!) {
  expect(
    (
      await page.request.post('/api/v1/auth/login', {
        headers: await readerHeaders(page),
        data: { email: `e2e-${account}@example.test`, password: supplied },
      })
    ).status(),
  ).toBe(200);
}
async function fill(page: Page, current: string, replacement: string, confirmation = replacement) {
  await page.getByLabel('Mật khẩu hiện tại', { exact: true }).fill(current);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(replacement);
  await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(confirmation);
}
async function blank(page: Page) {
  for (const label of ['Mật khẩu hiện tại', 'Mật khẩu mới', 'Nhập lại mật khẩu mới'])
    expect((await page.getByLabel(label, { exact: true }).inputValue()) === '').toBe(true);
}
for (const role of ['admin', 'lecturer', 'student'])
  test(`${role}: changes password once, rotates session and revokes a second browser`, async ({
    page,
    browser,
  }) => {
    const account = `password-${role}`;
    await login(page, account);
    const other = await browser.newContext();
    const tab = await other.newPage();
    await login(tab, account);
    await page.goto('/workspace/settings');
    const replacement = randomBytes(24).toString('base64url');
    await fill(page, process.env.E2E_PASSWORD!, replacement);
    await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Đã đổi mật khẩu.' })).toBeFocused();
    await blank(page);
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);
    expect((await tab.request.get('/api/v1/auth/me')).status()).toBe(401);
    await page.reload();
    await blank(page);
    await login(tab, account, replacement);
    await other.close();
  });
test('validates confirmation, wrong current password, pending duplicate and server rejection', async ({
  page,
}) => {
  await login(page, 'password-errors-student');
  await page.goto('/workspace/settings');
  const region = page.getByRole('region', { name: 'Bảo mật tài khoản', exact: true });
  let writes = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/auth/change-password') && request.method() === 'POST') writes++;
  });
  const replacement = randomBytes(24).toString('base64url');
  await fill(page, process.env.E2E_PASSWORD!, replacement, `${replacement}x`);
  await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
  await expect(region.getByRole('alert')).toContainText('không khớp');
  expect(writes).toBe(0);
  await fill(page, 'wrong current password', replacement);
  await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
  await expect(region.getByRole('alert')).toContainText('Mật khẩu hiện tại không đúng');
  await page.route('**/api/v1/auth/change-password', (route) =>
    route.fulfill({ status: 409, json: { code: 'CREDENTIAL_CHANGED' } }),
  );
  await fill(page, process.env.E2E_PASSWORD!, replacement);
  await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
  await expect(region.getByRole('alert')).toContainText('Đăng nhập lại');
  await blank(page);
  await expect(region.getByRole('link', { name: 'Đăng nhập lại' })).toBeVisible();
});
test('lost response after commit clears secrets and never claims success or retries', async ({
  page,
  browser,
}) => {
  const account = 'password-uncertain-student';
  await login(page, account);
  await page.goto('/workspace/settings');
  let writes = 0;
  await page.route('**/api/v1/auth/change-password', async (route) => {
    writes++;
    await route.fetch();
    await route.abort();
  });
  const replacement = randomBytes(24).toString('base64url');
  await fill(page, process.env.E2E_PASSWORD!, replacement);
  await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
  const region = page.getByRole('region', { name: 'Bảo mật tài khoản', exact: true });
  await expect(region.getByRole('alert')).toContainText('Chưa xác nhận');
  await expect(region.getByText('Đã đổi mật khẩu.', { exact: false })).toHaveCount(0);
  await blank(page);
  expect(writes).toBe(1);
  const other = await browser.newContext();
  const tab = await other.newPage();
  await login(tab, account, replacement);
  await other.close();
});
test('Unicode and spaces survive; empty password controls reflow at supported widths', async ({
  page,
}) => {
  await login(page, 'password-unicode-student');
  await page.goto('/workspace/settings');
  const replacement = `  ${'🙂'.repeat(16)}  `;
  await fill(page, process.env.E2E_PASSWORD!, replacement);
  await page.getByRole('button', { name: 'Hiện mật khẩu mới', exact: true }).click();
  expect(await page.getByLabel('Mật khẩu mới', { exact: true }).getAttribute('type')).toBe('text');
  await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã đổi mật khẩu.' })).toBeVisible();
  await blank(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
