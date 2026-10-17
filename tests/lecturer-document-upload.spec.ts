import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readerPdf } from './helpers/reader-pdf';
test.use({ actionTimeout: 15000 });

const word = () => readFileSync('apps/api/test/fixtures/docx/vietnamese.docx');
const picker = (page: Page) => page.getByLabel('File tài liệu (PDF hoặc DOCX)', { exact: true });
async function login(page: Page, role = 'lecturer') {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(`e2e-docx-${role}@example.test`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(`/workspace/${role}`);
}
async function setup(page: Page) {
  const code = `DOCX-${randomBytes(5).toString('hex').toUpperCase()}`;
  let csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
  expect(
    (
      await page.request.post('/api/v1/auth/login', {
        headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf },
        data: { email: 'e2e-docx-admin@example.test', password: process.env.E2E_PASSWORD! },
      })
    ).status(),
  ).toBe(200);
  csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
  const headers = { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf };
  const faculty = await page.request.post('/api/v1/admin/catalog/faculties', {
    headers,
    data: { code, name: 'Khoa kiểm thử DOCX' },
  });
  expect(faculty.status()).toBe(201);
  const course = await page.request.post('/api/v1/admin/catalog/courses', {
    headers,
    data: { code, name: 'Môn kiểm thử DOCX', facultyId: (await faculty.json()).item.id },
  });
  expect(course.status()).toBe(201);
  const users = await (
    await page.request.get('/api/v1/admin/users?search=e2e-docx-lecturer%40example.test')
  ).json();
  expect(
    (
      await page.request.post('/api/v1/admin/assignments', {
        headers,
        data: { lecturerId: users.items[0].id, courseId: (await course.json()).item.id },
      })
    ).status(),
  ).toBe(201);
  await page.request.post('/api/v1/auth/logout', { headers });
  await login(page);
  await page.goto('/workspace/lecturer/materials');
  await page.getByRole('button', { name: 'Tạo bản nháp', exact: true }).click();
  await page.getByLabel('Tìm môn học liên quan', { exact: true }).fill(code);
  const choice = page.getByLabel('Môn học liên quan', { exact: true });
  await expect(
    choice.getByRole('option', { name: `${code} · Môn kiểm thử DOCX`, exact: true }),
  ).toBeAttached();
  await choice.selectOption({ label: `${code} · Môn kiểm thử DOCX` });
  await page.getByRole('button', { name: 'Thêm môn', exact: true }).click();
  return code;
}
async function latest(page: Page, code: string) {
  return (await (await page.request.get(`/api/v1/material-drafts?search=${code}`)).json()).items[0];
}

test('lecturer picks PDF or DOCX on the new form; title, metadata and file survive upload response loss', async ({
  page,
}) => {
  test.setTimeout(90000);
  const code = await setup(page);
  await picker(page).setInputFiles({
    name: 'khong-ho-tro.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('test'),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'Chọn PDF hoặc DOCX' })).toBeVisible();
  await picker(page).setInputFiles({
    name: 'Tên gợi ý.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: word(),
  });
  await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toHaveValue('Tên gợi ý');
  await page.getByLabel('Tiêu đề học liệu', { exact: true }).fill(`Tài liệu ${code}`);
  await picker(page).setInputFiles({
    name: 'Đổi file không ghi đè tiêu đề.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: word(),
  });
  await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toHaveValue(
    `Tài liệu ${code}`,
  );
  if (process.env.CAPTURE_DOCX_UI === '1') {
    mkdirSync('.impeccable/review/docx-upload', { recursive: true });
    for (const [width, height] of [
      [1440, 1000],
      [768, 1024],
      [360, 900],
      [320, 800],
    ]) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `.impeccable/review/docx-upload/${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.route('**/api/v1/material-drafts/*/file', async (route) => {
    await route.fetch();
    await route.abort();
  });
  await page.getByRole('button', { name: 'Lưu và tải file lên', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Kiểm tra lần tải lên', exact: true }),
  ).toBeVisible();
  const first = await latest(page, code);
  expect(first.source.conversionState).toBe('QUEUED');
  await page.unroute('**/api/v1/material-drafts/*/file');
  await page.getByRole('button', { name: 'Kiểm tra lần tải lên', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Lưu và tải file lên', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Lưu và tải file lên', exact: true }).click();
  await expect(
    page.getByText('Đã lưu thông tin và file riêng tư.', { exact: false }),
  ).toBeVisible();
  expect((await latest(page, code)).source.id).toBe(first.source.id);
  await page.getByLabel('Tác giả', { exact: false }).fill('Đang soạn, không bị polling ghi đè');
  await page.getByRole('button', { name: 'Cập nhật trạng thái file', exact: true }).click();
  await expect(page.getByLabel('Tác giả', { exact: false })).toHaveValue(
    'Đang soạn, không bị polling ghi đè',
  );
  const before = await latest(page, code);
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken;
  expect(
    (
      await page.request.patch(`/api/v1/material-drafts/${before.id}`, {
        headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf },
        data: {
          title: `Tiêu đề từ tab khác ${code}`,
          authors: before.authors,
          description: before.description,
          materialType: before.materialType,
          sourceReference: before.sourceReference,
          rightsBasis: before.rightsBasis,
          downloadAllowed: before.downloadAllowed,
          courseIds: before.courses.map((c: { id: string }) => c.id),
          revision: before.revision,
        },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Cập nhật trạng thái file', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Thông tin học liệu đã đổi ở lượt khác' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu bản nháp', exact: true })).toBeDisabled();
  if (process.env.CAPTURE_DOCX_RECONCILIATION === '1') {
    mkdirSync('.impeccable/review/docx-upload', { recursive: true });
    await page.getByText('Xem thông tin mới để đối chiếu', { exact: true }).click();
    for (const width of [1440, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await page
        .getByRole('region', { name: 'Đối chiếu thông tin học liệu', exact: true })
        .screenshot({ path: `.impeccable/review/docx-upload/reconcile-${width}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
  await expect(page.getByLabel('Tiêu đề học liệu', { exact: true })).toHaveValue(
    `Tài liệu ${code}`,
  );
  await page.getByLabel('Tiêu đề học liệu', { exact: true }).fill(`Tiêu đề từ tab khác ${code}`);
  await page
    .getByLabel('Tôi đã đối chiếu và muốn lưu nội dung đang nhập.', { exact: true })
    .check();
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu bản nháp' })).toBeVisible();
  expect(await latest(page, code)).toMatchObject({
    title: `Tiêu đề từ tab khác ${code}`,
    authors: 'Đang soạn, không bị polling ghi đè',
  });
});

test('an uncertain metadata create blocks duplicate creation and keeps selected PDF', async ({
  page,
}) => {
  const code = await setup(page);
  await picker(page).setInputFiles({
    name: 'Bản PDF.pdf',
    mimeType: 'application/pdf',
    buffer: readerPdf(),
  });
  await page.getByLabel('Tiêu đề học liệu', { exact: true }).fill(`Metadata ${code}`);
  await page.route('**/api/v1/material-drafts', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Lưu và tải file lên', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Chưa xác nhận được bản nháp đã tạo' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Lưu và tải file lên', exact: true }),
  ).toBeDisabled();
  await expect(page.getByText('Đã chọn: Bản PDF.pdf', { exact: false })).toBeVisible();
  expect((await latest(page, code)).pdf).toBeNull();
});

test('real DOCX conversion supports lecturer publication and student private notes, highlights and original Word download', async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.DOCX_REAL !== '1',
    'Opt-in: Docker converter + ClamAV + built file-worker required.',
  );
  test.setTimeout(240000);
  const code = await setup(page);
  await picker(page).setInputFiles({
    name: 'Bài giảng tiếng Việt.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: word(),
  });
  await page.getByLabel('Tiêu đề học liệu', { exact: true }).fill(`DOCX thật ${code}`);
  await page.getByLabel('Cho phép người đọc tải file gốc và bản PDF', { exact: true }).check();
  await page.getByRole('button', { name: 'Lưu và tải file lên', exact: true }).click();
  await expect(
    page.getByText('Đã lưu thông tin và file riêng tư.', { exact: false }),
  ).toBeVisible();
  const item = await latest(page, code);
  const output = execFileSync(
    'docker',
    [
      'compose',
      '--env-file',
      'infra/.env',
      '-f',
      'infra/compose.yaml',
      '-f',
      'infra/compose.docx-test.yaml',
      'run',
      '--rm',
      '--no-deps',
      'file-worker',
      'node',
      'dist/scripts/process-source-once.js',
      item.source.id,
    ],
    { encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  expect(output).toContain('SAFE/READY');
  await page.getByRole('button', { name: 'Cập nhật trạng thái file', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Xem trước bản PDF', exact: true })).toBeVisible();
  expect(
    (await page.request.get(`/api/v1/material-drafts/${item.id}/preview`)).headers()[
      'content-type'
    ],
  ).toContain('application/pdf');
  await page.getByRole('button', { name: 'Công bố', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận công bố', exact: true }).click();
  await expect(page.locator('.publication-actions')).toContainText('Đã công bố');
  const context = await browser.newContext();
  try {
    const student = await context.newPage();
    await login(student, 'student');
    await student.goto(`/workspace/library/versions/${item.versionId}`);
    await expect(student.getByText('Đã hiển thị trang 1 / 2', { exact: true })).toBeVisible();
    await expect(student.getByRole('link', { name: 'Tải Word gốc', exact: true })).toBeVisible();
    const original = await student.request.get(
      `/api/v1/library/versions/${item.versionId}/source-download`,
    );
    expect(original.status()).toBe(200);
    expect(await original.body()).toEqual(word());
    const content = student.getByLabel('Nội dung ghi chú', { exact: true });
    await content.fill('Ghi chú riêng trên bản đọc DOCX');
    await student.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
    await expect(content).toHaveValue('');
    const text = student.locator('.textLayer span').filter({ hasText: 'HUCEScholar' }).first();
    await text.scrollIntoViewIfNeeded();
    const box = (await text.boundingBox())!;
    await student.mouse.move(box.x + 1, box.y + box.height / 2);
    await student.mouse.down();
    await student.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 15 });
    await student.mouse.up();
    await student.getByRole('button', { name: 'Tô sáng đoạn chọn', exact: true }).click();
    await student.getByLabel('Ghi chú cho đoạn tô', { exact: true }).fill('Ý chính từ Word');
    await student.getByRole('button', { name: 'Lưu vùng tô', exact: true }).click();
    await expect(student.locator('[data-highlight-id]').first()).toBeVisible();
    await student.getByRole('button', { name: 'Xoay trang', exact: true }).click();
    await student.reload();
    await student.getByRole('tab', { name: 'Ghi chú trang', exact: true }).click();
    await expect(
      student.getByText('Ghi chú riêng trên bản đọc DOCX', { exact: true }),
    ).toBeVisible();
    await expect(student.locator('[data-highlight-id]').first()).toBeVisible();
    const privateNotes = await (
      await page.request.get(`/api/v1/library/versions/${item.versionId}/notes?pageNumber=1`)
    ).json();
    expect(privateNotes.items).toEqual([]);
  } finally {
    await context.close();
  }
});
