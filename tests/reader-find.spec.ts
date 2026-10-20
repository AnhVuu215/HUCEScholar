import { expect, test, type Page } from '@playwright/test';
import { openReaderFixture, readerLogin, selectReaderText } from './helpers/reader-session';

let fixture: Awaited<ReturnType<typeof openReaderFixture>>;
async function fitReady(page: Page) {
  await expect
    .poll(() =>
      page.locator('.reader-stage').evaluate((element) => {
        const paper = element.querySelector('.reader-page');
        return (
          !!paper &&
          Math.abs(paper.getBoundingClientRect().width - Math.max(160, element.clientWidth - 64)) <
            2
        );
      }),
    )
    .toBe(true);
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
  ).toBeVisible();
}
test.describe('PDF reading tools', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    fixture = await openReaderFixture(page, 'find', { outline: true, splitText: true });
    await page.close();
  });
  test.beforeEach(async ({ page }) => {
    await readerLogin(page, 'student', 'find');
    await page.goto(`${fixture.route}?page=1`);
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
    ).toBeVisible();
  });
  test('find navigates results with temporary marks, survives zoom/rotation and never writes annotations', async ({
    page,
  }) => {
    let writes = 0;
    page.on('request', (request) => {
      if (/\/(notes|highlights)(\/|\?|$)/.test(request.url()) && request.method() !== 'GET')
        writes++;
    });
    await page.getByRole('button', { name: 'Tìm trong PDF', exact: true }).click();
    await page.getByLabel('Chữ cần tìm trong PDF', { exact: true }).fill('PAGE');
    await page.getByRole('button', { name: 'Tìm chữ', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: '2 kết quả · Đã tìm 2 / 2 trang' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Kết quả tiếp', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Kết quả 1 / 2 · Trang 1' }),
    ).toBeVisible();
    await expect(page.locator('.pdf-find-mark[data-current="true"]')).toHaveCount(1);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.getByRole('button', { name: 'Kết quả tiếp', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' }),
    ).toBeVisible();
    await expect(page.locator('.pdf-find-mark[data-current="true"]')).toHaveCount(1);
    await page.getByRole('combobox', { name: 'Mức phóng', exact: true }).click();
    await page.getByRole('option', { name: '150%', exact: true }).click();
    await page.getByRole('button', { name: 'Xoay trang', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' }),
    ).toBeVisible();
    await expect(page.locator('.pdf-find-mark[data-current="true"]')).toHaveCount(1);
    expect(writes).toBe(0);
    await page.getByLabel('Chữ cần tìm trong PDF', { exact: true }).fill('material');
    await page.getByRole('button', { name: 'Tìm chữ', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: '1 kết quả · Đã tìm 2 / 2 trang' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Kết quả tiếp', exact: true }).click();
    await expect(page.locator('.pdf-find-mark[data-current="true"]')).toHaveCount(2);
    expect(page.url()).not.toContain('PAGE');
    await page.getByRole('button', { name: 'Đóng tìm kiếm', exact: true }).click();
    await expect(page.locator('.pdf-find-mark')).toHaveCount(0);
  });
  test('outline jumps use the draft guard and never follow an external bookmark', async ({
    page,
    context,
  }) => {
    await expect(page.getByRole('button', { name: 'Mục lục PDF', exact: true })).toBeVisible();
    await page.getByLabel('Nội dung ghi chú', { exact: true }).fill('Giữ bản soạn khi đọc mục lục');
    await page.getByRole('button', { name: 'Mục lục PDF', exact: true }).click();
    await page.getByRole('button', { name: 'Broken chapter', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Mục lục nội bộ PDF', exact: true }).getByRole('alert'),
    ).toContainText('Chưa mở được mục này');
    await Promise.all([
      page.waitForEvent('dialog').then((dialog) => dialog.dismiss()),
      page.getByRole('button', { name: 'Study chapter', exact: true }).click(),
    ]);
    await expect(page.getByLabel('Nội dung ghi chú', { exact: true })).toHaveValue(
      'Giữ bản soạn khi đọc mục lục',
    );
    await Promise.all([
      page.waitForEvent('dialog').then((dialog) => dialog.accept()),
      page.getByRole('button', { name: 'Study chapter', exact: true }).click(),
    ]);
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'External bookmark', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'External bookmark', exact: true })).toHaveCount(
      0,
    );
    expect(context.pages()).toHaveLength(1);
  });
  test('find retries access failures and ignores late results after a new query or closing', async ({
    page,
  }) => {
    const endpoint = `**/api/v1/library/versions/${fixture.versionId}`;
    const region = page.getByRole('region', { name: 'Tìm chữ trong PDF', exact: true });
    await page.getByRole('button', { name: 'Tìm trong PDF', exact: true }).click();
    await page.route(endpoint, (route) => route.abort('timedout'), { times: 1 });
    await page.getByLabel('Chữ cần tìm trong PDF', { exact: true }).fill('page');
    await page.getByRole('button', { name: 'Tìm chữ', exact: true }).click();
    await expect(region.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Tìm chữ', exact: true }).click();
    await expect(
      region.getByRole('status').filter({ hasText: '2 kết quả · Đã tìm 2 / 2 trang' }),
    ).toBeVisible();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const pending = new Promise<void>((resolve) => {
      started = resolve;
    });
    await page.route(
      endpoint,
      async (route) => {
        const response = await route.fetch();
        started();
        await barrier;
        await route.fulfill({ response }).catch(() => {});
      },
      { times: 1 },
    );
    await page.getByLabel('Chữ cần tìm trong PDF', { exact: true }).fill('fixture');
    await page.getByRole('button', { name: 'Tìm chữ', exact: true }).click();
    await pending;
    await page.getByLabel('Chữ cần tìm trong PDF', { exact: true }).fill('Second');
    await page.getByRole('button', { name: 'Tìm chữ', exact: true }).click();
    await expect(
      region.getByRole('status').filter({ hasText: '1 kết quả · Đã tìm 2 / 2 trang' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Đóng tìm kiếm', exact: true }).click();
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(region).toHaveCount(0);
    await expect(page.locator('.pdf-find-mark')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tìm trong PDF', exact: true })).toBeFocused();
  });
  test('focus mode preserves drafts and Escape closes a select or find panel before leaving focus mode', async ({
    page,
  }) => {
    const input = page.getByLabel('Nội dung ghi chú', { exact: true });
    await input.fill('Bản soạn còn nguyên trong chế độ tập trung');
    await page.getByRole('button', { name: 'Đọc tập trung', exact: true }).click();
    await expect(
      page.getByRole('navigation', { name: 'Điều hướng không gian', exact: true }),
    ).toBeHidden();
    await expect(page.getByRole('region', { name: 'Ghi chú tài liệu', exact: true })).toBeHidden();
    await expect(page.getByLabel('Tiến độ đọc riêng', { exact: true })).toBeVisible();
    await fitReady(page);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: '.local/reader-focus.png', fullPage: true });
    await page.getByRole('combobox', { name: 'Mức phóng', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Thoát đọc tập trung', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tìm trong PDF', exact: true }).click();
    await page.getByLabel('Chữ cần tìm trong PDF', { exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Chữ cần tìm trong PDF', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Thoát đọc tập trung', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Đọc tập trung', exact: true })).toBeVisible();
    await expect(input).toHaveValue('Bản soạn còn nguyên trong chế độ tập trung');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await fitReady(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (width === 390) {
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: '.local/reader-tools-390.png', fullPage: true });
      }
    }
    await page.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
    await page.getByRole('button', { name: 'Đọc tập trung', exact: true }).click();
    await fitReady(page);
    await selectReaderText(page);
    await page.locator('.reader-stage').focus();
    await expect(
      page.getByRole('toolbar', { name: 'Thao tác đoạn chọn', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('toolbar', { name: 'Thao tác đoạn chọn', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Thoát đọc tập trung', exact: true }),
    ).toBeVisible();
    await selectReaderText(page);
    await page
      .getByRole('toolbar', { name: 'Thao tác đoạn chọn', exact: true })
      .getByRole('button', { name: 'Trích dẫn', exact: true })
      .click();
    await expect(
      page.getByRole('textbox', { name: 'Nội dung trích dẫn', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('textbox', { name: 'Nội dung trích dẫn', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Thoát đọc tập trung', exact: true }),
    ).toBeVisible();
    await selectReaderText(page);
    await page
      .getByRole('toolbar', { name: 'Thao tác đoạn chọn', exact: true })
      .getByRole('button', { name: 'Ghi chú đoạn chọn', exact: true })
      .click();
    await expect(page.getByLabel('Ghi chú cho đoạn tô', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Hủy vùng tô', exact: true }).click();
  });
});
test('scan PDF has an honest find fallback, no outline and still accepts page notes', async ({
  page,
}) => {
  await openReaderFixture(page, 'find-scan', { scan: true });
  await page.getByRole('button', { name: 'Tìm trong PDF', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Tìm chữ trong PDF', exact: true })).toContainText(
    'OCR chưa được hỗ trợ',
  );
  await expect(page.getByRole('button', { name: 'Tìm chữ', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Mục lục PDF', exact: true })).toHaveCount(0);
  await page.getByLabel('Nội dung ghi chú', { exact: true }).fill('Ghi chú PDF scan');
  await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu ghi chú' })).toBeVisible();
});
