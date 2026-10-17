import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('manifest offers real PNG icons and worker serves only a public offline fallback', async ({
  page,
  context,
  request,
}) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.icons).toContainEqual({
    src: '/icons/icon-192.png',
    sizes: '192x192',
    type: 'image/png',
    purpose: 'any',
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const auth = await page.evaluate(async () => {
    const result = await fetch('/api/v1/auth/me');
    return { status: result.status, cache: result.headers.get('cache-control') };
  });
  expect(auth).toEqual({ status: 401, cache: 'no-store' });
  await context.setOffline(true);
  await page.goto('/workspace/library');
  await expect(page.getByRole('heading', { name: 'Bạn đang mất kết nối' })).toBeVisible();
  if (process.env.CAPTURE_PWA_UI === '1') {
    mkdirSync('.impeccable/review/pwa', { recursive: true });
    for (const [name, width, height] of [
      ['desktop', 1440, 1000],
      ['mobile', 360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `.impeccable/review/pwa/${name}-offline.png`, fullPage: true });
    }
  }
  for (const path of [
    '/api/v1/auth/me',
    '/api/v1/library/versions/1/pdf',
    '/api/v1/annotations',
    '/icon.svg?token=synthetic-private-url',
    '/workspace/library',
  ]) {
    expect(
      await page.evaluate(async (path) => {
        try {
          await fetch(path, { cache: 'no-store', headers: { RSC: '1' } });
          return false;
        } catch {
          return true;
        }
      }, path),
    ).toBe(true);
  }
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith('hucescholar-public-'));
    return (
      await Promise.all(
        names.map(async (name) =>
          (await (await caches.open(name)).keys()).map((item) => new URL(item.url).pathname),
        ),
      )
    )
      .flat()
      .sort();
  });
  expect(cached).toEqual(
    [
      '/icon.svg',
      '/icons/apple-touch-icon.png',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/maskable-512.png',
      '/offline.html',
    ].sort(),
  );
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Thử mở lại trang chủ' }).click();
  await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true }).first()).toBeVisible();
});

test('PWA headers and PNG bytes match the manifest and Apple metadata', async ({
  request,
  page,
}) => {
  const worker = await request.get('/sw.js');
  expect(worker.status()).toBe(200);
  expect(worker.headers()['cache-control']).toBe('no-cache, no-store, must-revalidate');
  expect(worker.headers()['content-type']).toContain('application/javascript');
  expect(worker.headers()['x-content-type-options']).toBe('nosniff');
  expect(worker.headers()['content-security-policy']).toBe("default-src 'self'; script-src 'self'");
  for (const [name, size] of [
    ['icon-192', 192],
    ['icon-512', 512],
    ['maskable-512', 512],
    ['apple-touch-icon', 180],
  ] as const) {
    const response = await request.get(`/icons/${name}.png`);
    expect(response.status()).toBe(200);
    const png = await response.body();
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  }
  await page.goto('/install');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/icons/apple-touch-icon.png',
  );
  expect(
    await page.evaluate(async () => {
      const image = new Image();
      image.src = '/icons/maskable-512.png';
      await image.decode();
      return image.naturalWidth;
    }),
  ).toBe(512);
});

test('failed precache does not install a partially working offline worker', async ({
  page,
  context,
}) => {
  let requested = false;
  await context.route('**/offline.html', (route) => {
    requested = true;
    return route.fulfill({ status: 503, body: 'Synthetic unavailable asset' });
  });
  await page.goto('/install');
  await expect.poll(() => requested, { timeout: 15_000 }).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        return registrations.every((item) => !item.active && !item.installing);
      }),
    )
    .toBe(true);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Cài HUCEScholar trên thiết bị' })).toBeVisible();
});

test('worker preserves real HTTP errors instead of disguising them as offline', async ({
  page,
  context,
}) => {
  await page.goto('/install');
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 })
    .toBe(true);
  for (const status of [401, 404, 500]) {
    await context.route('**/workspace/synthetic-error', (route) =>
      route.fulfill({
        status,
        contentType: 'text/html',
        body: '<h1>HTTP error fixture</h1>',
      }),
    );
    const response = await page.goto('/workspace/synthetic-error');
    expect(response?.status()).toBe(status);
    await expect(page.getByRole('heading', { name: 'HTTP error fixture' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bạn đang mất kết nối' })).toHaveCount(0);
    await context.unroute('**/workspace/synthetic-error');
  }
});

test('worker activation removes only obsolete application caches and updates wait for open tabs', async ({
  page,
}) => {
  await page.goto('/offline.html');
  await page.evaluate(async () => {
    await (
      await caches.open('hucescholar-public-obsolete')
    ).put('/obsolete.html', new Response('Old public fixture'));
    await (
      await caches.open('unrelated-cache')
    ).put('/unrelated.html', new Response('Other application fixture'));
  });
  await page.goto('/login');
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 })
    .toBe(true);
  const names = await page.evaluate(() => caches.keys());
  expect(names).toContain('unrelated-cache');
  expect(names).not.toContain('hucescholar-public-obsolete');
  await page.getByLabel('Email').fill('unsent-demo@example.test');
  const controller = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL);
  await page.evaluate(() =>
    navigator.serviceWorker.register('/sw.js?update=synthetic', {
      scope: '/',
      updateViaCache: 'none',
    }),
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state,
        ),
      {
        timeout: 15_000,
      },
    )
    .toBe('installed');
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(controller);
  await expect(page.getByLabel('Email')).toHaveValue('unsent-demo@example.test');
  await expect(page).toHaveURL(/\/login$/);
});

test('install help stays useful without a browser prompt', async ({ page }) => {
  await page.goto('/install');
  await expect(page.getByRole('heading', { name: 'Cài HUCEScholar trên thiết bị' })).toBeVisible();
  await expect(
    page.getByText('PDF và ghi chú vẫn cần kết nối mạng.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'iPhone và iPad' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cài ứng dụng', exact: true })).toHaveCount(0);
});
