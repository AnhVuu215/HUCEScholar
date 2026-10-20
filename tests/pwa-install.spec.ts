import { expect, test, type Page } from './helpers/test';
import { mkdirSync } from 'node:fs';

async function ready(page: Page) {
  await page.goto('/install');
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 15_000,
    })
    .toBe(true);
}

async function offer(page: Page, result: 'accepted' | 'dismissed' | 'failed' | 'installed') {
  await page.evaluate((result) => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(event, {
      prompt: {
        value: async () => {
          if (result === 'failed') throw new Error('Synthetic native prompt failure');
          if (result === 'installed') window.dispatchEvent(new Event('appinstalled'));
        },
      },
      userChoice: {
        value: Promise.resolve({ outcome: result === 'dismissed' ? result : 'accepted' }),
      },
    });
    window.dispatchEvent(event);
  }, result);
}

for (const [result, message] of [
  ['accepted', 'Bạn đã chọn cài. Trình duyệt sẽ hoàn tất cài đặt ứng dụng.'],
  ['dismissed', 'Bạn đã đóng hộp thoại cài đặt. Bạn vẫn có thể dùng HUCEScholar trên trình duyệt.'],
  ['failed', 'Chưa mở được hộp thoại cài đặt. Hãy dùng menu trình duyệt theo hướng dẫn bên dưới.'],
  ['installed', 'HUCEScholar đã được cài. Bạn có thể mở từ màn hình chính.'],
] as const) {
  test(`browser install ${result} keeps an honest outcome`, async ({ page }) => {
    await ready(page);
    await offer(page, result);
    const install = page.getByRole('button', { name: 'Cài ứng dụng', exact: true });
    await install.focus();
    await install.press('Enter');
    await expect(page.getByRole('status')).toHaveText(message);
    await expect(install).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'iPhone và iPad' })).toBeVisible();
  });
}

test('standalone view never offers a second install button', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await ready(page);
  await offer(page, 'accepted');
  await expect(page.getByRole('status')).toHaveText(
    'HUCEScholar đang được dùng dưới dạng ứng dụng.',
  );
  await expect(page.getByRole('button', { name: 'Cài ứng dụng', exact: true })).toHaveCount(0);
});

test('install offer survives navigation from landing and leaving the help page', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 15_000,
    })
    .toBe(true);
  await offer(page, 'accepted');
  await page.getByText('Có cần tải ứng dụng về máy không?', { exact: true }).click();
  await page.getByRole('link', { name: 'xem hướng dẫn cài PWA', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cài ứng dụng', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Về trang chủ', exact: true }).click();
  await page.getByText('Có cần tải ứng dụng về máy không?', { exact: true }).click();
  await page.getByRole('link', { name: 'xem hướng dẫn cài PWA', exact: true }).click();
  await page.getByRole('button', { name: 'Cài ứng dụng', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Bạn đã chọn cài. Trình duyệt sẽ hoàn tất cài đặt ứng dụng.',
  );
});

for (const [name, width, height] of [
  ['desktop', 1440, 1000],
  ['tablet', 768, 1024],
  ['mobile', 360, 800],
] as const) {
  test(`${name}: install help is readable and its links work`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/install');
    await expect(
      page.getByRole('heading', { name: 'Cài HUCEScholar trên thiết bị' }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (process.env.CAPTURE_PWA_UI === '1') {
      mkdirSync('.impeccable/review/pwa', { recursive: true });
      await page.screenshot({ path: `.impeccable/review/pwa/${name}-install.png`, fullPage: true });
    }
    await page.getByRole('link', { name: 'Đăng nhập để bắt đầu', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Cài ứng dụng trên thiết bị', exact: true }).click();
    await expect(page).toHaveURL(/\/install$/);
  });
}
