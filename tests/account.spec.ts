import { expect, test } from './helpers/test';
import { readerLogin } from './helpers/reader-session';
for (const role of ['admin', 'lecturer', 'student'] as const) {
  test(`${role}: edits its profile, updates shell, reloads and preserves legacy route`, async ({
    page,
  }) => {
    // The helper's role union only excludes lecturer because original reader fixtures did not need it.
    if (role === 'lecturer') {
      const token = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
      expect(
        (
          await page.request.post('/api/v1/auth/login', {
            headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': token },
            data: {
              email: 'e2e-account-v2-lecturer@example.test',
              password: process.env.E2E_PASSWORD!,
            },
          })
        ).status(),
      ).toBe(200);
    } else await readerLogin(page, role, 'account-v2');
    await page.goto('/workspace/profile');
    await expect(
      page.getByRole('heading', { name: 'Tài khoản của bạn', exact: true }),
    ).toBeVisible();
    const name = `Tên ${role} <b>văn bản</b> ${Date.now()}`;
    await page.getByLabel('Tên hiển thị', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Lưu tên', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã lưu tên hiển thị.' }),
    ).toBeVisible();
    await expect(page.locator('.workspace-account-name')).toHaveText(name);
    await expect(page.locator('.workspace-account-name b')).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel('Tên hiển thị', { exact: true })).toHaveValue(name);
    await page.goto(`/workspace/${role}`);
    await expect(page.getByLabel('Tên hiển thị', { exact: true })).toHaveValue(name);
    await page.getByRole('button', { name: 'Menu tài khoản', exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'Tài khoản của tôi', exact: true }),
    ).toHaveAttribute('href', '/workspace/profile');
    await expect(page.getByRole('link', { name: 'Cài đặt', exact: true })).toHaveAttribute(
      'href',
      '/workspace/settings',
    );
  });
}
test('profile retains draft on conflict, guards navigation and reconciles a lost committed response', async ({
  page,
}) => {
  await readerLogin(page, 'student', 'account-v2');
  await page.goto('/workspace/profile');
  const input = page.getByLabel('Tên hiển thị', { exact: true });
  const draft = `Bản soạn hồ sơ ${Date.now()}`;
  await input.fill(draft);
  await Promise.all([
    page.waitForEvent('dialog').then((dialog) => dialog.dismiss()),
    page.getByRole('link', { name: 'Bảo mật và cài đặt', exact: true }).click(),
  ]);
  await expect(input).toHaveValue(draft);
  await page.route('**/api/v1/account/profile', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 409, json: { code: 'REVISION_CONFLICT' } })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Lưu tên', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Tài khoản của bạn', exact: true }).getByRole('alert'),
  ).toContainText('Thông tin đã thay đổi');
  await expect(input).toHaveValue(draft);
  await page.unroute('**/api/v1/account/profile');
  await page.getByRole('button', { name: 'Tải lại để đối chiếu', exact: true }).click();
  await expect(input).toHaveValue(draft);
  await page.route('**/api/v1/account/profile', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    await route.fetch();
    await route.abort();
  });
  await page.getByRole('button', { name: 'Lưu tên', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Tài khoản của bạn', exact: true }).getByRole('alert'),
  ).toContainText('Chưa xác nhận');
  await expect(input).toHaveValue(draft);
  await page.unroute('**/api/v1/account/profile');
  await page.getByRole('button', { name: 'Tải lại để đối chiếu', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã đối chiếu với máy chủ.' }),
  ).toBeVisible();
  await expect(page.locator('.workspace-account-name')).toHaveText(draft);
});
