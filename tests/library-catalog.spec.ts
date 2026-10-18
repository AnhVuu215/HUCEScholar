import { expect, test, type Page, type Route } from '@playwright/test';
import { readerLogin } from './helpers/reader-session';
import type { LibraryItem } from '../apps/web/lib/library';

const title = 'Học liệu kiểm thử ' + 'tiêu đề dài '.repeat(20);
const item: LibraryItem = {
  documentId: '1',
  versionId: '1',
  versionNo: 2,
  title,
  authors: 'Tác giả kiểm thử',
  description: '',
  materialType: 'EXAM',
  kind: 'LECTURER_MATERIAL',
  publicationMethod: 'ADMIN_REVIEW',
  current: true,
  sourceReference: '',
  rightsBasis: 'SYNTHETIC',
  rightsValidUntil: null,
  downloadAllowed: false,
  pageCount: 2,
  hasTextLayer: true,
  byteSize: 500,
  courses: [{ id: '1', code: 'TEST', name: 'Môn kiểm thử' }],
};
async function mockCatalog(page: Page) {
  await page.route('**/api/v1/library/courses', (route) =>
    route.fulfill({ json: { items: item.courses } }),
  );
  await page.route(/\/api\/v1\/library\?/, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    await route.fulfill({
      json: {
        items: params.get('search') === 'trống' ? [] : [item],
        total: params.get('search') === 'trống' ? 0 : 25,
        page: Number(params.get('page')),
        limit: 12,
      },
    });
  });
}
test.beforeEach(async ({ page }) => {
  await readerLogin(page, 'student', 'catalog-v2');
  await mockCatalog(page);
});

test('public filters restore through history, pagination resets on submit and clear', async ({
  page,
}) => {
  await page.goto(
    '/workspace/library?search=cũ&courseId=1&kind=LECTURER_MATERIAL&materialType=EXAM&page=2',
  );
  await expect(page.getByRole('status').filter({ hasText: '25 học liệu · Trang 2' })).toBeVisible();
  const filters = page.getByRole('button', { name: 'Bộ lọc (2)' });
  await expect(filters).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('combobox', { name: 'Nguồn học liệu' })).toBeHidden();
  await filters.click();
  await expect(page.getByRole('combobox', { name: 'Nguồn học liệu' })).toContainText(
    'Học liệu giảng viên',
  );
  await page.getByLabel('Tìm học liệu', { exact: true }).fill('mới');
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await expect(page).toHaveURL(/search=m%E1%BB%9Bi.*materialType=EXAM$/);
  await expect(page.getByRole('button', { name: 'Tìm kiếm', exact: true })).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: 'Trang 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Trang sau' }).click();
  await expect(page).toHaveURL(/page=2$/);
  await expect(page.getByRole('button', { name: 'Trang sau' })).toBeFocused();
  await page.goBack();
  await expect(page.getByRole('status').filter({ hasText: 'Trang 1' })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Tìm học liệu', { exact: true })).toHaveValue('cũ');
  await expect(page.getByRole('status').filter({ hasText: 'Trang 2' })).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel('Tìm học liệu', { exact: true })).toHaveValue('mới');
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await expect(page).toHaveURL('/workspace/library');
  await expect(page.getByLabel('Tìm học liệu', { exact: true })).toHaveValue('');
});

test('empty, failed request and retry keep filters available', async ({ page }) => {
  await page.goto('/workspace/library?search=trống');
  await expect(page.getByText('Chưa có học liệu phù hợp.', { exact: false })).toBeVisible();
  const timeout = (route: Route) => route.abort('timedout');
  await page.route(/\/api\/v1\/library\?/, timeout);
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Chưa tải được học liệu' })).toBeVisible();
  await page.unroute(/\/api\/v1\/library\?/, timeout);
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
});

test('a stale course link keeps its selected filter visible and can be cleared', async ({
  page,
}) => {
  await page.goto('/workspace/library?courseId=999');
  await expect(page.getByLabel('Môn học', { exact: true })).toHaveValue('999');
  await expect(
    page.getByRole('option', { name: 'Môn đã chọn không còn trong danh sách' }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await expect(page.getByLabel('Môn học', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Tìm học liệu', { exact: true })).toBeFocused();
  // Clearing an unapplied draft also removes its button, without changing the URL.
  await page.getByLabel('Tìm học liệu', { exact: true }).fill('bản tìm đang soạn');
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await expect(page).toHaveURL('/workspace/library');
  await expect(page.getByLabel('Tìm học liệu', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Tìm học liệu', { exact: true })).toBeFocused();
});

test('a late response cannot replace a newer query; invalid URL filters are removed', async ({
  page,
}) => {
  await page.goto('/workspace/library?kind=BAD&page=-1&note=private');
  await expect(page).toHaveURL('/workspace/library');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(/\/api\/v1\/library\?.*search=old/, async (route) => {
    started();
    await gate;
    await route
      .fulfill({ json: { items: [{ ...item, title: 'OLD' }], total: 1, page: 1, limit: 12 } })
      .catch(() => {});
  });
  await page.getByLabel('Tìm học liệu', { exact: true }).fill('old');
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await waiting;
  const canceled = page.waitForEvent('requestfailed', {
    predicate: (request) => new URL(request.url()).searchParams.get('search') === 'old',
  });
  await page.getByLabel('Tìm học liệu', { exact: true }).fill('trống');
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await expect(page.getByText('Chưa có học liệu phù hợp.', { exact: false })).toBeVisible();
  await canceled;
  release();
  await expect(page.getByRole('heading', { name: 'OLD', exact: true })).toHaveCount(0);
});

test('long titles and expanded controls reflow at supported viewport sizes', async ({ page }) => {
  await page.goto('/workspace/library');
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('combobox', { name: 'Nguồn học liệu' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.getByRole('link', { name: `Đọc ${title}`, exact: true })).toBeVisible();
    if (process.env.CAPTURE_LIBRARY === '1')
      await page.screenshot({ path: `.local/library-${width}.png`, fullPage: true });
  }
});
