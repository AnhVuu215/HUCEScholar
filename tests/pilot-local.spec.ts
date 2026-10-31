import { expect, test, type Browser, type Page } from './helpers/test';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * QA-01 local pilot. Opt-in: needs `python scripts/create-pilot-corpus.py` and the real
 * ClamAV/Poppler/converter worker attached ONLY to hucescholar_test / Redis 15
 * (compose.yaml + compose.docx-test.yaml, profile files). Records observations; it is an
 * automated walk-through, not a substitute for sessions with real lecturers and students.
 */
test.skip(process.env.PILOT_REAL !== '1', 'Opt-in: real file worker and pilot corpus required.');
test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 15_000 });

const corpus = '.local/pilot-corpus';
const code = `PILOT-${randomBytes(4).toString('hex').toUpperCase()}`;
const courseName = 'Sức bền vật liệu thử nghiệm';
const observations: Record<string, unknown>[] = [];
const versions: Record<string, string> = {};
const titles: Record<string, string> = {};
let courseId = '';

type Case = { key: string; file: string; title: string; expect: 'SAFE' | 'FAILED' | 'OBSERVE' };
const cases: Case[] = [
  { key: 'vi', file: 'vietnamese-text.pdf', title: 'Bài giảng Sức bền vật liệu', expect: 'SAFE' },
  { key: 'docx', file: 'bai-giang-tieng-viet.docx', title: 'Bài giảng Word', expect: 'SAFE' },
  { key: 'scan', file: 'scan-only.pdf', title: 'Bản scan bài tập', expect: 'SAFE' },
  { key: 'rotated', file: 'rotated-mixed.pdf', title: 'Bản vẽ trang xoay', expect: 'SAFE' },
  { key: 'long', file: 'long-400-pages.pdf', title: 'Giáo trình 400 trang', expect: 'SAFE' },
  { key: 'near', file: 'near-limit.pdf', title: 'PDF sát giới hạn', expect: 'SAFE' },
  { key: 'perm', file: 'permissions-only.pdf', title: 'PDF khóa quyền', expect: 'OBSERVE' },
  { key: 'encrypted', file: 'encrypted.pdf', title: 'PDF có mật khẩu', expect: 'FAILED' },
  { key: 'truncated', file: 'truncated.pdf', title: 'PDF bị cắt cụt', expect: 'FAILED' },
  { key: 'garbage', file: 'garbage.pdf', title: 'PDF hỏng', expect: 'FAILED' },
];

function note(entry: Record<string, unknown>) {
  observations.push({ at: new Date().toISOString(), ...entry });
}

async function headers(page: Page) {
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).csrfToken as string;
  return { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf };
}

async function login(browser: Browser, role: 'admin' | 'lecturer' | 'student') {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(`e2e-pilot-${role}@example.test`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(`/workspace/${role}`);
  return page;
}

const fileStatus = (page: Page) =>
  page.getByRole('region', { name: 'Trạng thái file tài liệu' }).getByRole('status').first();
const finalState =
  /đã qua kiểm tra an toàn\.?$|không đạt kiểm tra|Bản đọc PDF đã sẵn sàng|Chưa tạo được bản đọc PDF/;

async function startDraft(page: Page) {
  await page.goto('/workspace/lecturer/materials');
  await page.getByRole('button', { name: 'Tạo bản nháp', exact: true }).click();
  await page.getByLabel('Tìm môn học liên quan', { exact: true }).fill(code);
  const choice = page.getByLabel('Môn học liên quan', { exact: true });
  const label = `${code} · ${courseName}`;
  await expect(choice.getByRole('option', { name: label, exact: true })).toBeAttached();
  await choice.selectOption({ label });
  await page.getByRole('button', { name: 'Thêm môn', exact: true }).click();
}

/** Waits for the real worker, nudging with the status button once automatic watching stops. */
async function waitForWorker(page: Page) {
  const started = Date.now();
  while (Date.now() - started < 240_000) {
    const text = (await fileStatus(page).textContent()) ?? '';
    if (finalState.test(text.trim())) return { text: text.trim(), ms: Date.now() - started };
    await page.waitForTimeout(3_000);
    const refresh = page.getByRole('button', { name: 'Cập nhật trạng thái file', exact: true });
    if (await refresh.isEnabled()) await refresh.click();
  }
  throw new Error('Worker did not finish within 4 minutes.');
}

async function openReader(page: Page, key: string) {
  await page.goto(`/workspace/library/versions/${versions[key]}`);
  const shown = page.getByRole('status').filter({ hasText: /^Đã hiển thị trang 1 \/ \d+$/ });
  const started = Date.now();
  await expect(shown).toBeVisible({ timeout: 60_000 });
  return { text: (await shown.textContent())!, ms: Date.now() - started };
}

async function find(page: Page, query: string) {
  const panel = page.getByRole('region', { name: 'Tìm chữ trong PDF' });
  if (!(await panel.isVisible()))
    await page.getByRole('button', { name: 'Tìm trong PDF', exact: true }).click();
  await panel.getByLabel('Chữ cần tìm trong PDF', { exact: true }).fill(query);
  const started = Date.now();
  await panel.getByRole('button', { name: 'Tìm chữ', exact: true }).click();
  const done = panel.getByRole('status').filter({ hasText: /kết quả · Đã tìm (\d+) \/ \1 trang/ });
  await expect(done).toBeVisible({ timeout: 120_000 });
  const text = (await done.textContent())!;
  return { count: Number(/^(\d+) kết quả/.exec(text)?.[1]), ms: Date.now() - started };
}

async function goToPage(page: Page, number: number, total: number) {
  await page.getByLabel('Số trang', { exact: true }).fill(String(number));
  const started = Date.now();
  await expect(
    page.getByRole('status').filter({ hasText: `Đã hiển thị trang ${number} / ${total}` }),
  ).toBeVisible({ timeout: 60_000 });
  return Date.now() - started;
}

test.beforeAll(() => {
  for (const item of cases)
    if (!existsSync(`${corpus}/${item.file}`))
      throw new Error('Run python scripts/create-pilot-corpus.py first.');
});

test.afterAll(() => {
  mkdirSync('test-results/pilot-local', { recursive: true });
  writeFileSync(
    'test-results/pilot-local/observations.json',
    JSON.stringify({ code, observations }, null, 2),
  );
});

test('admin prepares the course and assigns the lecturer', async ({ browser }) => {
  const page = await login(browser, 'admin');
  const h = await headers(page);
  const faculty = await page.request.post('/api/v1/admin/catalog/faculties', {
    headers: h,
    data: { code, name: 'Khoa thử nghiệm pilot' },
  });
  expect(faculty.status()).toBe(201);
  const course = await page.request.post('/api/v1/admin/catalog/courses', {
    headers: h,
    data: { code, name: courseName, facultyId: (await faculty.json()).item.id },
  });
  expect(course.status()).toBe(201);
  courseId = (await course.json()).item.id;
  const lecturer = (
    await (
      await page.request.get('/api/v1/admin/users?search=e2e-pilot-lecturer%40example.test')
    ).json()
  ).items[0];
  const assignment = await page.request.post('/api/v1/admin/assignments', {
    headers: h,
    data: { lecturerId: lecturer.id, courseId },
  });
  expect(assignment.status()).toBe(201);
  await page.context().close();
});

test('lecturer uploads every corpus file through the real worker', async ({ browser }) => {
  test.setTimeout(40 * 60_000);
  const page = await login(browser, 'lecturer');
  const picker = page.getByLabel('File tài liệu (PDF hoặc DOCX)', { exact: true });

  // Over the 25 MiB limit: the form refuses before sending, and the API refuses on its own.
  await startDraft(page);
  await picker.setInputFiles(`${corpus}/over-limit.pdf`);
  await expect(page.getByRole('alert').filter({ hasText: 'đến 25 MiB' })).toBeVisible();
  note({ case: 'over-limit', layer: 'form', outcome: 'rejected before upload' });

  for (const item of cases) {
    const title = `${item.title} ${code}`;
    titles[item.key] = title;
    await startDraft(page);
    await picker.setInputFiles(`${corpus}/${item.file}`);
    await page.getByLabel('Tiêu đề học liệu', { exact: true }).fill(title);
    if (item.key === 'docx')
      await page.getByLabel('Cho phép người đọc tải file gốc và bản PDF', { exact: true }).check();
    const uploadStarted = Date.now();
    await page.getByRole('button', { name: 'Lưu và tải file lên', exact: true }).click();
    await expect(
      page.getByText('Đã lưu thông tin và file riêng tư.', { exact: false }),
    ).toBeVisible({ timeout: 120_000 });
    const uploadMs = Date.now() - uploadStarted;
    const worker = await waitForWorker(page);
    const pages = await page
      .locator('.draft-file-name')
      .last()
      .textContent()
      .catch(() => null);
    const safe = /đã qua kiểm tra an toàn\.?$|Bản đọc PDF đã sẵn sàng/.test(worker.text);
    note({
      case: item.key,
      file: item.file,
      uploadMs,
      workerMs: worker.ms,
      status: worker.text,
      file_line: pages?.trim(),
    });
    await page.screenshot({ path: `test-results/pilot-local/lecturer-${item.key}.png` });
    if (item.expect === 'SAFE') expect(safe, `${item.file}: ${worker.text}`).toBe(true);
    if (item.expect === 'FAILED') expect(safe, `${item.file}: ${worker.text}`).toBe(false);
    if (!safe) {
      await expect(page.getByRole('button', { name: 'Công bố', exact: true })).toBeDisabled();
      continue;
    }
    await page.getByRole('button', { name: 'Công bố', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận công bố', exact: true }).click();
    await expect(page.locator('.publication-actions')).toContainText('Đã công bố');
    const draft = (
      await (
        await page.request.get(`/api/v1/material-drafts?search=${encodeURIComponent(title)}`)
      ).json()
    ).items[0];
    versions[item.key] = draft.versionId;
  }

  // The API enforces the limit even when a client skips the form check.
  const h = await headers(page);
  const created = await page.request.post('/api/v1/material-drafts', {
    headers: h,
    data: {
      title: `PDF vượt giới hạn ${code}`,
      authors: 'Tác giả minh họa',
      description: 'Kiểm tra giới hạn dung lượng phía máy chủ.',
      materialType: 'EXERCISE',
      sourceReference: 'Tự biên soạn — minh họa',
      rightsBasis: 'Tác giả cho phép — minh họa',
      downloadAllowed: false,
      courseIds: [courseId],
    },
  });
  expect(created.status()).toBe(201);
  const response = await page.request.post(
    `/api/v1/material-drafts/${(await created.json()).item.id}/pdf`,
    {
      headers: {
        ...h,
        'Content-Type': 'application/pdf',
        'X-File-Name': 'over-limit.pdf',
        'If-Match': '"1"',
      },
      data: readFileSync(`${corpus}/over-limit.pdf`),
      failOnStatusCode: false,
    },
  );
  const body = await response.text();
  note({ case: 'over-limit', layer: 'api', status: response.status(), body });
  expect(response.status()).toBe(413);
  await page.context().close();
});

test('student finds, reads, annotates and comes back in a new session', async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  let page = await login(browser, 'student');

  // Accent-insensitive catalog search for the Vietnamese lecture.
  await page.goto('/workspace/library');
  const results = page.getByRole('status').filter({ hasText: /học liệu · Trang/ });
  // Words that are not adjacent in the title: the search matches one contiguous phrase.
  await page.getByLabel('Tìm học liệu', { exact: true }).fill(`bai giang ${code}`);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await expect(results).toBeVisible();
  note({ case: 'vi', step: 'search non-adjacent words', status: await results.textContent() });
  await page.getByLabel('Tìm học liệu', { exact: true }).fill(`suc ben vat lieu ${code}`);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  const read = page.getByRole('link', { name: `Đọc ${titles.vi}`, exact: true });
  await expect(read).toBeVisible();
  note({ case: 'vi', step: 'search without accents', outcome: 'found' });
  await read.click();
  const opened = await page
    .getByRole('status')
    .filter({ hasText: 'Đã hiển thị trang 1 / 3' })
    .waitFor({ timeout: 60_000 })
    .then(() => true);
  expect(opened).toBe(true);

  const accented = await find(page, 'cốt thép');
  const plain = await find(page, 'cot thep');
  note({ case: 'vi', step: 'find', accented, unaccented: plain });
  expect(accented.count).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Đóng tìm kiếm', exact: true }).click();
  await page.getByRole('button', { name: 'Mục lục PDF', exact: true }).click();
  const chapter = page.getByRole('button', { name: /Chương 3\. Bê tông cốt thép/ });
  await expect(chapter).toBeVisible();
  await chapter.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 3 / 3' }),
  ).toBeVisible();
  note({ case: 'vi', step: 'outline', outcome: 'chapter 3 opened page 3' });

  const words = page.locator('.textLayer span').filter({ hasText: 'Bê tông chịu nén tốt' }).first();
  await words.scrollIntoViewIfNeeded();
  const box = (await words.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 15 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Tô sáng đoạn chọn', exact: true }).click();
  await page.getByLabel('Ghi chú cho đoạn tô', { exact: true }).fill('Ôn lại trước kiểm tra');
  await page.getByRole('button', { name: 'Lưu vùng tô', exact: true }).click();
  await expect(page.locator('[data-highlight-id]').first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Ghi chú trang', exact: true }).click();
  const content = page.getByLabel('Nội dung ghi chú', { exact: true });
  await content.fill('Trang 3: xem lại lớp bê tông bảo vệ.');
  await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
  await expect(content).toHaveValue('', { timeout: 15_000 });
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `test-results/pilot-local/reader-vi-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  // Scan without a text layer: clear message, no fake OCR, page notes still work.
  const scan = await openReader(page, 'scan');
  await expect(
    page.getByText('Tài liệu scan có thể không chọn được chữ', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tìm trong PDF', exact: true }).click();
  await expect(page.getByLabel('Chữ cần tìm trong PDF', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Đóng tìm kiếm', exact: true }).click();
  note({ case: 'scan', step: 'open', ...scan, find: 'disabled with scan message' });
  await page.getByRole('button', { name: 'Báo cáo vấn đề với tài liệu', exact: true }).click();
  await page
    .getByLabel('Loại vấn đề', { exact: true })
    .selectOption({ label: 'File lỗi, thiếu trang hoặc chữ mờ' });
  await page.getByLabel('Mô tả', { exact: true }).fill('Bản scan không tìm được chữ.');
  await page.getByRole('button', { name: 'Gửi báo cáo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã gửi báo cáo.' })).toBeVisible({
    timeout: 15_000,
  });

  // Rotated pages honour /Rotate: 90 and 270 render landscape, A3 sheet renders landscape.
  const rotated = await openReader(page, 'rotated');
  const shapes: string[] = [];
  for (let n = 1; n <= 5; n++) {
    if (n > 1) await goToPage(page, n, 5);
    const size = await page
      .locator('.reader-page canvas')
      .first()
      .evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
    shapes.push(size[0] > size[1] ? 'landscape' : 'portrait');
    await page.screenshot({ path: `test-results/pilot-local/reader-rotated-${n}.png` });
  }
  note({ case: 'rotated', step: 'pages', ...rotated, shapes });
  expect(shapes).toEqual(['portrait', 'landscape', 'portrait', 'landscape', 'landscape']);

  // 400 pages: jump to the end, search a phrase on page 397, outline with 20 chapters.
  const long = await openReader(page, 'long');
  const lastMs = await goToPage(page, 400, 400);
  const needle = await find(page, 'PILOTNEEDLE');
  note({ case: 'long', step: 'open/jump/find', ...long, lastPageMs: lastMs, find: needle });
  expect(needle.count).toBe(1);
  await page.getByRole('button', { name: 'Đóng tìm kiếm', exact: true }).click();
  await page.getByRole('button', { name: 'Mục lục PDF', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Chapter 20', exact: true })).toBeVisible();

  const near = await openReader(page, 'near');
  note({ case: 'near', step: 'open', ...near });

  const word = await openReader(page, 'docx');
  await expect(page.getByRole('link', { name: 'Tải Word gốc', exact: true })).toBeVisible();
  note({ case: 'docx', step: 'open', ...word });
  await page.context().close();

  // A fresh session finds the private notes again on the right version.
  page = await login(browser, 'student');
  await page.goto(`/workspace/library/versions/${versions.vi}`);
  // Reading progress resumes on the page left in the previous session.
  await expect(page.getByRole('status').filter({ hasText: 'Đã hiển thị trang 3 / 3' })).toBeVisible(
    { timeout: 60_000 },
  );
  const reopen = page.getByRole('button', { name: 'Hiện ghi chú', exact: true });
  if (await reopen.isVisible()) await reopen.click();
  await page.getByRole('tab', { name: 'Toàn tài liệu', exact: true }).click();
  const notebook = page.getByRole('button', { name: /^Mở (ghi chú|đoạn tô) · Trang 3$/ });
  await expect(notebook).toHaveCount(2, { timeout: 15_000 });
  note({ case: 'vi', step: 'new session notebook', outcome: '2 items on page 3' });
  await page.context().close();
});

test('lecturer creates the next version; old notes stay on the old version', async ({
  browser,
}) => {
  test.setTimeout(10 * 60_000);
  const page = await login(browser, 'lecturer');
  await page.goto('/workspace/lecturer/materials');
  await page.getByRole('button', { name: `Mở bản nháp ${titles.vi}`, exact: true }).click();
  await page.getByRole('button', { name: 'Tạo phiên bản kế tiếp', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận tạo phiên bản', exact: true }).click();
  await expect(page.getByText('Đã tạo phiên bản kế tiếp.', { exact: false })).toBeVisible();
  await page
    .getByLabel('File tài liệu (PDF hoặc DOCX)', { exact: true })
    .setInputFiles(`${corpus}/rotated-mixed.pdf`);
  await page.getByRole('button', { name: 'Lưu và tải file lên', exact: true }).click();
  await expect(page.getByText('Đã lưu thông tin và file riêng tư.', { exact: false })).toBeVisible({
    timeout: 60_000,
  });
  const worker = await waitForWorker(page);
  expect(worker.text).toMatch(/đã qua kiểm tra an toàn/);
  await page.getByRole('button', { name: 'Công bố', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận công bố', exact: true }).click();
  await expect(page.locator('.publication-actions')).toContainText('Đã công bố');
  const next = (
    await (
      await page.request.get(`/api/v1/material-drafts?search=${encodeURIComponent(titles.vi)}`)
    ).json()
  ).items[0].versionId as string;
  expect(next).not.toBe(versions.vi);
  note({ case: 'vi', step: 'next version', workerMs: worker.ms });
  await page.context().close();

  const student = await login(browser, 'student');
  await student.goto(`/workspace/library/versions/${versions.vi}`);
  // VERSION-01: the notice says this is the earlier published version.
  await expect(
    student.getByText('Bạn đang đọc phiên bản 1, là bản công bố trước.', { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  const h = await headers(student);
  const old = await student.request.post(
    `/api/v1/library/versions/${versions.vi}/annotations/search`,
    { headers: h, data: {} },
  );
  const fresh = await student.request.post(`/api/v1/library/versions/${next}/annotations/search`, {
    headers: h,
    data: {},
  });
  expect((await old.json()).items).toHaveLength(2);
  expect((await fresh.json()).items).toHaveLength(0);
  note({ case: 'vi', step: 'notes pinned to version', old: 2, next: 0 });
  await student.context().close();
});

test('admin handles the report, cannot read private notes, hides and restores', async ({
  browser,
}) => {
  test.setTimeout(5 * 60_000);
  const page = await login(browser, 'admin');
  const h = await headers(page);
  const notes = await page.request.post(
    `/api/v1/library/versions/${versions.vi}/annotations/search`,
    { headers: h, data: {}, failOnStatusCode: false },
  );
  const visible = notes.ok() ? (await notes.json()).items.length : 0;
  note({ case: 'privacy', step: 'admin notebook', status: notes.status(), items: visible });
  expect(visible).toBe(0);

  await page.goto('/workspace/admin/reports');
  await page.getByLabel('Tìm theo tiêu đề tài liệu', { exact: true }).fill(titles.scan);
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: titles.scan }).first();
  await row.getByRole('button', { name: /^Xem báo cáo/ }).click();
  await page.getByLabel('Kết quả gửi người báo cáo').fill('Bản scan chưa có OCR; giữ nguyên.');
  await page.getByRole('button', { name: 'Không cần xử lý', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Lịch sử xử lý' })).toContainText('chưa có OCR');

  const documentId = (
    await (await page.request.get(`/api/v1/library/versions/${versions.scan}`)).json()
  ).item.documentId;
  const student = await login(browser, 'student');
  const readable = async () =>
    (await student.request.get(`/api/v1/library/versions/${versions.scan}`)).status();
  const states: number[] = [];
  for (const visibility of ['HIDDEN', 'VISIBLE'] as const) {
    const current = (await (await page.request.get(`/api/v1/admin/materials/${documentId}`)).json())
      .item;
    const changed = await page.request.post(`/api/v1/admin/materials/${documentId}/visibility`, {
      headers: await headers(page),
      data: {
        revision: current.revision,
        visibility,
        reason: 'Pilot local: ẩn rồi khôi phục',
        ...(visibility === 'VISIBLE' ? { resolved: true } : {}),
      },
    });
    expect(changed.status(), `${visibility}: ${await changed.text()}`).toBe(201);
    states.push(await readable());
  }
  note({ case: 'scan', step: 'hide/restore', studentStatusHiddenThenVisible: states });
  expect(states).toEqual([404, 200]);
  await student.context().close();
  await page.context().close();
});
