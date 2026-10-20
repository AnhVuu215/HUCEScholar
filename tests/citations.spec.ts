import { expect, test } from './helpers/test';
import {
  openReaderFixture,
  selectReaderText,
  readerHeaders,
  readerLogin,
  readerLogout,
} from './helpers/reader-session';
import { formatCitation, parseCitationPage } from '../apps/web/lib/citations';

test('citation formatter preserves plain text and exact version without invented authors', () => {
  const text = formatCitation({
    quote: 'Tiếng Việt\n<script>alert(1)</script>',
    title: 'Tài liệu <b>gốc</b>',
    versionNo: 2,
    versionId: '9007199254740993',
    pageNumber: 7,
    origin: 'https://reader.example.test',
  });
  expect(text).toBe(
    '“Tiếng Việt\n<script>alert(1)</script>” — Tài liệu <b>gốc</b>; phiên bản 2; trang PDF 7. https://reader.example.test/workspace/library/versions/9007199254740993?page=7',
  );
  expect(text).not.toContain('undefined');
  const source = {
    quote: 'Đoạn trích',
    title: 'Nguồn',
    versionNo: 1,
    versionId: '1',
    pageNumber: 1,
    origin: 'https://reader.example.test',
  };
  for (const origin of [
    'javascript:alert(1)',
    'https://user:password@reader.example.test',
    'https://reader.example.test/path',
    'https://reader.example.test?quote=secret',
  ])
    expect(() => formatCitation({ ...source, origin })).toThrow();
});

test('page parser distinguishes missing links from invalid or repeated page parameters', () => {
  expect(parseCitationPage(undefined)).toBeUndefined();
  expect(parseCitationPage('42')).toBe(42);
  for (const value of ['', '0', '-1', '01', '1.5', '1e2', ' 2 ', '9007199254740992', ['1', '2']])
    expect(parseCitationPage(value)).toBeNull();
});

test.describe('reader citations', () => {
  let fixture: Awaited<ReturnType<typeof openReaderFixture>>;
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      fixture = await openReaderFixture(page, 'citations');
    } finally {
      await page.close();
    }
  });
  test.beforeEach(async ({ page }) => {
    await readerLogin(page, 'student', 'citations');
    await page.goto(`${fixture.route}?page=1`);
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
    ).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã lưu tiến độ · Trang 1' }),
    ).toBeVisible();
  });

  test('citation copies real selection with provenance without creating a highlight', async ({
    page,
  }) => {
    const { path, versionId } = fixture;
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as unknown as { copied: string }).copied = text;
          },
        },
      });
    });
    await selectReaderText(page);
    const quote = await page.evaluate(() => window.getSelection()!.toString());
    await page
      .getByRole('toolbar', { name: 'Thao tác đoạn chọn' })
      .getByRole('button', { name: 'Trích dẫn', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã sao chép trích dẫn.' }),
    ).toBeVisible();
    const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied);
    expect(copied).toContain(`“${quote}”`);
    expect(copied).toContain('Tác giả minh họa; phiên bản 1; trang PDF 1.');
    expect(copied).toContain(
      `http://127.0.0.1:3100/workspace/library/versions/${versionId}?page=1`,
    );
    expect(
      (await (await page.request.get(`${path}/highlights?pageNumber=1`)).json()).items,
    ).toEqual([]);
  });

  test('clipboard denial exposes selectable plain text and preserves the snapshot across pages', async ({
    page,
  }) => {
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error('denied');
          },
        },
      }),
    );
    await selectReaderText(page);
    await page.getByRole('button', { name: 'Trích dẫn đoạn chọn', exact: true }).click();
    const citation = page.getByRole('textbox', { name: 'Nội dung trích dẫn', exact: true });
    await expect(citation).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã sao chép trích dẫn.' }),
    ).toHaveCount(0);
    const original = await citation.inputValue();
    await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' }),
    ).toBeVisible();
    await expect(citation).toHaveValue(original);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' }),
      ).toBeVisible();
      await citation.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `.local/citations-${width}.png`, fullPage: true });
    }
    await page.getByRole('button', { name: 'Chọn nội dung trích dẫn', exact: true }).click();
    expect(
      await citation.evaluate(
        (node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart,
      ),
    ).toBe(original.length);
    await page.getByRole('button', { name: 'Lưu đoạn vào ghi chú', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Vùng tô đang soạn · Trang 1', exact: true }),
    ).toBeVisible();
  });

  test('clipboard success waits for resolution and unavailable clipboard falls back', async ({
    page,
  }) => {
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: () =>
            new Promise<void>((resolve) => {
              (window as unknown as { finishCopy: () => void }).finishCopy = resolve;
            }),
        },
      }),
    );
    await selectReaderText(page);
    await page.getByRole('button', { name: 'Trích dẫn đoạn chọn', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đang sao chép trích dẫn…' }),
    ).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã sao chép trích dẫn.' }),
    ).toHaveCount(0);
    await page.evaluate(() => (window as unknown as { finishCopy: () => void }).finishCopy());
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã sao chép trích dẫn.' }),
    ).toBeVisible();
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }),
    );
    await page.getByRole('button', { name: 'Sao chép lại trích dẫn', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Chưa sao chép được.' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng trích dẫn', exact: true }).click();
    await expect(
      page.getByLabel('Trang tài liệu; cuộn ngang khi phóng lớn', { exact: true }),
    ).toBeFocused();
  });

  test('return to previous progress and same-route citation links protect an annotation draft', async ({
    page,
  }) => {
    const { route } = fixture;
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã lưu tiến độ · Trang 1' }),
    ).toBeVisible();
    await page.goto(`${route}?page=2`);
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' }),
    ).toBeVisible();
    await page.getByLabel('Nội dung ghi chú', { exact: true }).fill('Giữ bản soạn trang 2');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page
      .getByRole('button', { name: 'Quay lại tiến độ trước · Trang 1', exact: true })
      .click();
    await expect(page.getByLabel('Nội dung ghi chú', { exact: true })).toHaveValue(
      'Giữ bản soạn trang 2',
    );
    await page.evaluate((route) => {
      history.pushState(history.state, '', `${route}?page=1`);
      history.pushState(history.state, '', `${route}?page=2`);
    }, route);
    let prompts = 0;
    page.on('dialog', async (dialog) => {
      prompts++;
      await dialog.dismiss();
    });
    await page.evaluate(() => history.back());
    await expect.poll(() => prompts).toBe(1);
    await expect(page).toHaveURL(new RegExp('page=2$'));
    await expect(page.getByLabel('Nội dung ghi chú', { exact: true })).toHaveValue(
      'Giữ bản soạn trang 2',
    );
    await expect(page.getByRole('spinbutton', { name: 'Số trang', exact: true })).toHaveValue('2');
    await page.evaluate((href) => {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = 'Liên kết trích dẫn khác';
      document.body.append(link);
    }, `${route}?page=1`);
    await page.getByRole('link', { name: 'Liên kết trích dẫn khác', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('page=2$'));
    await expect(page.getByLabel('Nội dung ghi chú', { exact: true })).toHaveValue(
      'Giữ bản soạn trang 2',
    );
  });

  test('citation links never grant access to hidden materials or their PDF', async ({ page }) => {
    const { path, route } = await openReaderFixture(page, 'citations-hidden');
    const documentId = (await (await page.request.get(path)).json()).item.documentId;
    await readerLogout(page);
    await readerLogin(page, 'admin', 'citations-hidden');
    const current = (await (await page.request.get(`/api/v1/admin/materials/${documentId}`)).json())
      .item;
    expect(
      (
        await page.request.post(`/api/v1/admin/materials/${documentId}/visibility`, {
          headers: await readerHeaders(page),
          data: {
            revision: current.revision,
            visibility: 'HIDDEN',
            reason: 'Kiểm thử quyền liên kết trích dẫn',
          },
        })
      ).status(),
    ).toBe(201);
    await readerLogout(page);
    await readerLogin(page, 'student', 'citations-hidden');
    await page.goto(`${route}?page=2`);
    await expect(page.getByRole('button', { name: 'Thử mở lại PDF', exact: true })).toBeVisible();
    await expect(page.locator('.reader-page canvas')).toHaveCount(0);
    for (const endpoint of [path, `${path}/pdf`]) {
      const response = await page.request.get(endpoint);
      expect(response.status()).toBe(404);
      expect(response.headers()['cache-control']).toContain('no-store');
    }
  });

  test('page link takes precedence over progress and offers return to the previous page', async ({
    page,
  }) => {
    const { route } = fixture;
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã lưu tiến độ · Trang 1' }),
    ).toBeVisible();
    await page.goto(`${route}?page=2`);
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 2 / 2' }),
    ).toBeVisible();
    await expect(
      page.getByText('Đang mở trang được dẫn · Trang 2.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã lưu tiến độ · Trang 2' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Quay lại tiến độ trước · Trang 1', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
    ).toBeVisible();
  });

  test('invalid page links do not render or overwrite progress before explicit recovery', async ({
    page,
  }) => {
    const { route } = fixture;
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã lưu tiến độ · Trang 1' }),
    ).toBeVisible();
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/progress') && request.method() === 'PUT')
        writes.push(request.postData() ?? '');
    });
    for (const query of ['0', '-1', '1.5', 'abc', '1&page=2', '3']) {
      await page.goto(`${route}?page=${query}`);
      await expect(
        page.getByRole('alert').filter({ hasText: 'Trang trong liên kết không hợp lệ' }),
      ).toBeVisible();
      await expect(page.locator('.reader-page canvas')).toHaveCount(0);
    }
    expect(writes).toEqual([]);
    await page.getByRole('button', { name: 'Đọc từ tiến độ đã lưu', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
    ).toBeVisible();
    await page.route('**/progress', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 409, contentType: 'application/json', body: '{}' })
        : route.continue(),
    );
    await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Tải lại tiến độ', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Tải lại tiến độ', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
    ).toBeVisible();
    // Explicit recovery also consumes the linked target if the first progress read failed.
    await page.unroute('**/progress');
    await page.route('**/progress', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );
    await page.goto(`${route}?page=3`);
    await page
      .getByRole('button', { name: 'Đọc từ trang 1, chưa lưu tiến độ', exact: true })
      .click();
    await page.getByRole('button', { name: 'Đọc từ tiến độ đã lưu', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
    ).toBeVisible();
    await page.unroute('**/progress');
    const reloadedProgress = page.waitForResponse(
      (response) =>
        response.url().endsWith('/progress') &&
        response.request().method() === 'GET' &&
        response.status() === 200,
    );
    await page.getByRole('button', { name: 'Tải lại tiến độ', exact: true }).click();
    await reloadedProgress;
    await expect(page.getByRole('status').filter({ hasText: 'Đang tải tiến độ đọc…' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('spinbutton', { name: 'Số trang', exact: true })).toHaveValue('1');
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 1 / 2' }),
    ).toBeVisible();
  });
});
