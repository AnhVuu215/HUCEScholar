import { expect, test, type Page } from './helpers/test';
import { mkdirSync } from 'node:fs';

async function login(page: Page, role: 'admin' | 'lecturer' | 'student' = 'student') {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(`e2e-workspace-ui-${role}@example.test`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(`/workspace/${role}`);
  await expect(page.getByRole('heading', { name: 'Tài khoản của bạn', exact: true })).toBeVisible();
}

test('library controls align and keep readable targets', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto('/workspace/library');
  const search = page.getByLabel('Tìm học liệu', { exact: true });
  const submit = page.getByRole('button', { name: 'Tìm kiếm', exact: true });
  const inputBounds = await search.boundingBox();
  const buttonBounds = await submit.boundingBox();
  expect(inputBounds!.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(inputBounds!.height - buttonBounds!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(inputBounds!.y - buttonBounds!.y)).toBeLessThanOrEqual(1);
  expect(await submit.evaluate((element) => getComputedStyle(element).marginTop)).toBe('0px');
  if (process.env.CAPTURE_WORKSPACE_UI === '1') {
    mkdirSync('.impeccable/review/workspace-v2', { recursive: true });
    await expect(page.getByRole('status').filter({ hasText: /học liệu · Trang/ })).toBeVisible();
    await page.screenshot({
      path: '.impeccable/review/workspace-v2/library-desktop.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
    await page.getByRole('combobox', { name: 'Nguồn học liệu', exact: true }).click();
    await page.screenshot({
      path: '.impeccable/review/workspace-v2/dropdown-desktop.png',
      fullPage: true,
    });
  }
});

for (const [role, count] of [
  ['admin', 7],
  ['lecturer', 4],
  ['student', 3],
] as const) {
  test(`${role}: grouped navigation and account disclosure preserve destinations`, async ({
    page,
  }) => {
    await login(page, role);
    const navigation = page.getByRole('navigation', { name: 'Điều hướng không gian' });
    await expect(navigation.getByRole('link')).toHaveCount(count);
    await expect(navigation.getByRole('link', { name: 'Cài ứng dụng' })).toHaveCount(0);
    await expect(navigation.getByRole('link', { name: 'Tài khoản của tôi' })).toHaveCount(0);
    const account = page.getByRole('button', { name: 'Menu tài khoản', exact: true });
    await expect(account).toHaveAttribute('aria-expanded', 'false');
    await account.click();
    const profile = page.getByRole('link', { name: 'Tài khoản của tôi', exact: true });
    await expect(profile).toHaveAttribute('href', '/workspace/profile');
    await expect(page.getByRole('link', { name: 'Cài đặt', exact: true })).toHaveCount(1);
    await profile.focus();
    await page.keyboard.press('Escape');
    await expect(account).toBeFocused();
    await expect(profile).toBeHidden();
    await navigation.getByRole('link', { name: 'Kho học liệu', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Kho học liệu', exact: true })).toBeVisible();
    await expect(
      navigation.getByRole('link', { name: 'Kho học liệu', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Kho học liệu', exact: true })).toBeVisible();
  });
}

test('rounded select supports keyboard, cancel, outside click and real filter submit', async ({
  page,
}) => {
  await login(page);
  await page.goto('/workspace/library');
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  const source = page.getByRole('combobox', { name: 'Nguồn học liệu', exact: true });
  await source.focus();
  await page.keyboard.press('Enter');
  const popup = page.getByRole('listbox', { name: 'Nguồn học liệu', exact: true });
  await expect(popup).toBeVisible();
  expect(await popup.evaluate((element) => getComputedStyle(element).borderRadius)).toBe('12px');
  await page.keyboard.press('End');
  await page.keyboard.press('Escape');
  await expect(source).toBeFocused();
  await expect(source).toContainText('Tất cả nguồn');
  await page.keyboard.press('Space');
  await page.keyboard.press('h');
  await page.keyboard.press('Enter');
  await expect(source).toContainText('Học liệu giảng viên');
  await source.click();
  await page.getByRole('heading', { name: 'Kho học liệu', exact: true }).click();
  await expect(popup).toHaveCount(0);
  const request = page.waitForRequest(
    (request) =>
      request.url().includes('/api/v1/library?') &&
      request.url().includes('kind=LECTURER_MATERIAL'),
  );
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await request;
  await source.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(popup).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Loại học liệu', exact: true })).toBeFocused();
});

for (const width of [320, 390]) {
  test(`${width}px: dropdown stays in viewport and account logout failure recovers`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await login(page);
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Điều hướng không gian' })
      .getByRole('link', { name: 'Kho học liệu', exact: true })
      .click();
    await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
    const source = page.getByRole('combobox', { name: 'Nguồn học liệu', exact: true });
    await source.scrollIntoViewIfNeeded();
    await source.click();
    const popup = page.getByRole('listbox', { name: 'Nguồn học liệu', exact: true });
    const bounds = await popup.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(800);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (process.env.CAPTURE_WORKSPACE_UI === '1') {
      mkdirSync('.impeccable/review/workspace-v2', { recursive: true });
      await page.screenshot({
        path: `.impeccable/review/workspace-v2/library-mobile-${width}.png`,
        fullPage: false,
      });
    }
    await page.getByRole('button', { name: 'Menu tài khoản', exact: true }).click();
    await page.route('**/api/v1/auth/logout', (route) => route.abort());
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Chưa đăng xuất được' })).toBeVisible();
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);
    await page.unroute('**/api/v1/auth/logout');
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await expect(page).toHaveURL('/login');
  });
}

test.describe('200% zoom reflow emulation', () => {
  test.use({ viewport: { width: 720, height: 500 }, deviceScaleFactor: 2 });
  test('controls and popup remain reachable at half the desktop CSS viewport', async ({ page }) => {
    await login(page);
    await page.goto('/workspace/library');
    await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
    const select = page.getByRole('combobox', { name: 'Loại học liệu', exact: true });
    await select.scrollIntoViewIfNeeded();
    await select.click();
    const popup = page.getByRole('listbox', { name: 'Loại học liệu', exact: true });
    const bounds = await popup.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(720);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(500);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(popup).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
});
