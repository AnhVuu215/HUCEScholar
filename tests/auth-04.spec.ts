import { expect, test } from './helpers/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';

const environment = parseEnv(readFileSync('.local/test.env', 'utf8'));
const outbox = environment.MAIL_DIR ?? '';
const sent = 'Đã nhận yêu cầu. Thư xác nhận sẽ đến email này trong vài phút';

/** The API delivers after answering; wait for the newest sign-up link to this address. */
async function newestLink(to: string, after: number) {
  let link = '';
  await expect
    .poll(
      () => {
        if (!existsSync(outbox)) return '';
        const mails = readdirSync(outbox)
          .filter((f) => Number(f.split('-')[0]) >= after)
          .map((f) => JSON.parse(readFileSync(join(outbox, f), 'utf8')))
          .filter((m: { to: string }) => m.to === to);
        link =
          /http:\/\/127\.0\.0\.1:3100(\/signup\/complete#token=[\w-]{43})/.exec(
            mails.at(-1)?.text ?? '',
          )?.[1] ?? '';
        return link;
      },
      { timeout: 15_000 },
    )
    .not.toBe('');
  return link;
}

test('a lecturer signs up by email, chooses the role and signs in', async ({ page }) => {
  test.setTimeout(90_000);
  // A fresh address per attempt, so a retry never meets an account made earlier.
  const email = `e2e-signup-${randomBytes(5).toString('hex')}@example.test`;
  const password = `${randomBytes(15).toString('base64url')} mới`;
  await page.goto('/login');
  await page.getByRole('link', { name: 'Đăng ký', exact: true }).click();
  await expect(page).toHaveURL('/signup');
  const started = Date.now();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Gửi thư xác nhận', exact: true }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(sent);
  const link = await newestLink(email, started - 1000);

  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hoàn tất đăng ký');
  await expect(page.getByRole('radio', { name: /Quản trị/ })).toHaveCount(0);
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Giảng viên tự đăng ký');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Nhập lại mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Chọn vai trò');
  await page.getByRole('radio', { name: /Giảng viên/ }).check();
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText('Đã tạo tài khoản');
  // The token leaves the address bar once used, and the link cannot be used twice.
  expect(page.url()).not.toContain('#token=');
  await page.goto('/login');
  await page.goto(link);
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Lần hai');
  await page.getByRole('radio', { name: /Sinh viên/ }).check();
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Nhập lại mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Liên kết không hợp lệ');

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL('/workspace/lecturer');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/signup');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
