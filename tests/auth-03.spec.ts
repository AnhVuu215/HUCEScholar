import { expect, test } from './helpers/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';

const environment = parseEnv(readFileSync('.local/test.env', 'utf8'));
const outbox = environment.MAIL_DIR ?? '';
const email = 'e2e-recover-student@example.test';
const generic =
  'Nếu email thuộc một tài khoản đang hoạt động, thư hướng dẫn sẽ đến trong vài phút.';

/** The API delivers after answering; wait for the newest mail to this address. */
async function newestLink(after: number) {
  let link = '';
  await expect
    .poll(
      () => {
        if (!existsSync(outbox)) return '';
        const mails = readdirSync(outbox)
          .filter((f) => Number(f.split('-')[0]) >= after)
          .map((f) => JSON.parse(readFileSync(join(outbox, f), 'utf8')))
          .filter((m: { to: string }) => m.to === email);
        link =
          /http:\/\/127\.0\.0\.1:3100(\/reset-password#token=[\w-]{43})/.exec(
            mails.at(-1)?.text ?? '',
          )?.[1] ?? '';
        return link;
      },
      { timeout: 15_000 },
    )
    .not.toBe('');
  return link;
}

test('a forgotten password is reset through the emailed link and old credentials stop working', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/login');
  await page.getByRole('link', { name: 'Quên mật khẩu?', exact: true }).click();
  await expect(page).toHaveURL('/forgot-password');
  // Unknown and known addresses get the same answer.
  await page.getByLabel('Email tài khoản', { exact: true }).fill('khong-ton-tai@example.test');
  await page.getByRole('button', { name: 'Gửi liên kết đặt lại', exact: true }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(generic);
  const started = Date.now();
  await page.getByLabel('Email tài khoản', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Gửi liên kết đặt lại', exact: true }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(generic);
  const link = await newestLink(started - 1000);

  // Without the fragment the form refuses before contacting the server.
  await page.goto('/reset-password');
  const fresh = `${randomBytes(15).toString('base64url')} mới`;
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(fresh);
  await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(fresh);
  await page.getByRole('button', { name: 'Đặt mật khẩu mới', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Liên kết không đầy đủ');

  await page.goto(link);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(fresh);
  await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(`${fresh}x`);
  await page.getByRole('button', { name: 'Đặt mật khẩu mới', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('không khớp');
  await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(fresh);
  await page.getByRole('button', { name: 'Đặt mật khẩu mới', exact: true }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText('Đã đặt mật khẩu mới');
  // The token leaves the address bar once used.
  expect(page.url()).not.toContain('#token=');

  // Reusing the link fails; the old password no longer signs in; the new one does.
  await page.goto('/login');
  await page.goto(link);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(fresh);
  await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(fresh);
  await page.getByRole('button', { name: 'Đặt mật khẩu mới', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'không hợp lệ hoặc đã hết hạn',
  );
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('không đúng');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(fresh);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL('/workspace/student');
});
