import { expect, test, type Page } from './helpers/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { readerHeaders, readerLogout } from './helpers/reader-session';
import { readerPdf } from './helpers/reader-pdf';

async function login(page: Page, role: 'admin' | 'lecturer' | 'student', account = 'course1') {
  const response = await page.request.post('/api/v1/auth/login', {
    headers: await readerHeaders(page),
    data: { email: `e2e-${account}-${role}@example.test`, password: process.env.E2E_PASSWORD! },
  });
  expect(response.status()).toBe(200);
}
/** Synthetic scan verdict in the isolated test DB. */
async function markSafe(documentId: string) {
  const environment = parseEnv(readFileSync('.local/test.env', 'utf8'));
  const url = new URL(environment.TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test')) throw new Error('Isolated test database required.');
  const { Client } = createRequire(`${process.cwd()}/apps/api/package.json`)('pg');
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    await db.query(
      "UPDATE hucescholar.files SET scan_status='SAFE',checked_at=now(),page_count=2,has_text_layer=true WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE document_id=$1)",
      [documentId],
    );
  } finally {
    await db.end();
  }
}

/** A course with an assigned lecturer and two published materials. */
async function courseWithMaterials(page: Page, account = 'course1') {
  const code = `CL1-${randomBytes(5).toString('hex').toUpperCase()}`;
  await login(page, 'admin', account);
  let headers = await readerHeaders(page);
  const faculty = await page.request.post('/api/v1/admin/catalog/faculties', {
    headers,
    data: { code, name: 'Khoa kiểm thử danh sách đọc' },
  });
  const course = await page.request.post('/api/v1/admin/catalog/courses', {
    headers,
    data: { code, name: 'Môn có danh sách đọc', facultyId: (await faculty.json()).item.id },
  });
  expect(course.status()).toBe(201);
  const courseId = (await course.json()).item.id as string;
  const lecturer = (
    await (
      await page.request.get(
        `/api/v1/admin/users?search=${encodeURIComponent(`e2e-${account}-lecturer@example.test`)}`,
      )
    ).json()
  ).items[0];
  expect(
    (
      await page.request.post('/api/v1/admin/assignments', {
        headers,
        data: { courseId, lecturerId: lecturer.id },
      })
    ).status(),
  ).toBe(201);
  await readerLogout(page);
  await login(page, 'student', account);
  headers = await readerHeaders(page);
  const titles = [`Giáo trình chương 1 ${code}`, `Bài tập chương 2 ${code}`];
  for (const title of titles) {
    const draft = await page.request.post('/api/v1/material-drafts', {
      headers,
      data: {
        title,
        authors: 'Tác giả minh họa',
        description: 'Tài liệu cho danh sách đọc.',
        materialType: 'EXERCISE',
        sourceReference: 'Tự biên soạn — minh họa',
        rightsBasis: 'Tác giả cho phép — minh họa',
        downloadAllowed: false,
        courseIds: [courseId],
      },
    });
    const id = (await draft.json()).item.id as string;
    expect(
      (
        await page.request.post(`/api/v1/material-drafts/${id}/pdf`, {
          headers: {
            ...headers,
            'Content-Type': 'application/pdf',
            'X-File-Name': 'danh-sach.pdf',
            'If-Match': '"1"',
          },
          data: readerPdf(),
        })
      ).status(),
    ).toBe(201);
    await markSafe(id);
    expect(
      (
        await page.request.post(`/api/v1/material-drafts/${id}/submit`, {
          headers,
          data: { revision: 2 },
        })
      ).status(),
    ).toBe(201);
  }
  await readerLogout(page);
  await login(page, 'admin', account);
  headers = await readerHeaders(page);
  const pending = (
    await (
      await page.request.get(`/api/v1/admin/publication-requests?search=${code}&limit=10`)
    ).json()
  ).items;
  expect(pending).toHaveLength(2);
  for (const request of pending)
    expect(
      (
        await page.request.post(`/api/v1/admin/publication-requests/${request.id}/decision`, {
          headers,
          data: {
            revision: request.revision,
            submittedRevision: request.submittedRevision,
            outcome: 'APPROVED',
            reason: 'Tài liệu minh họa được phép',
            rightsConfirmed: true,
          },
        })
      ).status(),
    ).toBe(201);
  await readerLogout(page);
  return { code, courseId, titles };
}

test('a lecturer arranges published materials by week and students open the chosen versions', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { code, courseId, titles } = await courseWithMaterials(page);
  await login(page, 'lecturer');
  await page.goto('/workspace/lecturer/reading-lists');
  await page.getByRole('combobox', { name: 'Môn được phân công', exact: true }).click();
  await page.getByRole('option', { name: `${code} · Môn có danh sách đọc`, exact: true }).click();
  await page.getByLabel('Tên danh sách', { exact: true }).fill('Lộ trình đọc học kỳ 1');
  await page.getByLabel('Tìm tài liệu của môn để thêm', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Tìm tài liệu', exact: true }).click();
  for (const title of [...titles].reverse())
    await page.getByRole('button', { name: `Thêm vào danh sách: ${title}`, exact: true }).click();
  // Added in reverse; restore the order with the move buttons.
  await page.getByRole('button', { name: new RegExp(`^Đưa lên: ${titles[0]}`) }).click();
  await page.getByLabel('Tuần hoặc chủ đề').first().fill('Tuần 1');
  await page.getByLabel('Ghi chú cho người đọc').first().fill('Đọc trước buổi học');
  await page.getByLabel('Tuần hoặc chủ đề').nth(1).fill('Tuần 2');
  await page.getByRole('button', { name: 'Lưu danh sách', exact: true }).click();
  await expect(page.getByText('Đã lưu bản nháp. Người đọc chưa thấy danh sách.')).toBeVisible();
  await page.getByLabel('Công bố cho người đọc của môn').check();
  await page.getByRole('button', { name: 'Lưu danh sách', exact: true }).click();
  await expect(page.getByText('Đã lưu. Người đọc của môn thấy danh sách này.')).toBeVisible();
  await readerLogout(page);

  await login(page, 'student');
  await page.goto(`/workspace/library/reading-lists?courseId=${courseId}`);
  const list = page.getByRole('article', { name: 'Lộ trình đọc học kỳ 1' });
  await expect(list.getByRole('heading', { name: 'Tuần 1' })).toBeVisible();
  await expect(list.getByRole('heading', { name: 'Tuần 2' })).toBeVisible();
  await expect(list.getByText('Đọc trước buổi học')).toBeVisible();
  const links = list.getByRole('link');
  await expect(links).toHaveText(titles);
  await links.first().click();
  await expect(page).toHaveURL(/\/workspace\/library\/versions\/\d+$/);
  await expect(page.getByRole('heading', { name: titles[0] })).toBeVisible({ timeout: 15_000 });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/workspace/library/reading-lists?courseId=${courseId}`);
  await expect(list).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('CAL-04b: a due date set by the lecturer shows on calendars of students who follow the course', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { code, courseId, titles } = await courseWithMaterials(page);
  // Three days ahead stays inside the agenda (today + 30 days).
  const due = new Date();
  due.setDate(due.getDate() + 3);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dueKey = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
  await login(page, 'lecturer');
  await page.goto('/workspace/lecturer/reading-lists');
  await page.getByRole('combobox', { name: 'Môn được phân công', exact: true }).click();
  await page.getByRole('option', { name: `${code} · Môn có danh sách đọc`, exact: true }).click();
  await page.getByLabel('Tên danh sách', { exact: true }).fill('Danh sách có hạn');
  await page.getByLabel('Tìm tài liệu của môn để thêm', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Tìm tài liệu', exact: true }).click();
  await page.getByRole('button', { name: `Thêm vào danh sách: ${titles[0]}`, exact: true }).click();
  await page.getByLabel('Tuần hoặc chủ đề').first().fill('Tuần 1');
  await page.getByLabel('Hạn đọc (không bắt buộc)').first().fill(dueKey);
  await page.getByLabel('Công bố cho người đọc của môn').check();
  await page.getByRole('button', { name: 'Lưu danh sách', exact: true }).click();
  await expect(page.getByText('Đã lưu. Người đọc của môn thấy danh sách này.')).toBeVisible();
  await expect(page.getByLabel('Hạn đọc (không bắt buộc)').first()).toHaveValue(dueKey);
  await readerLogout(page);

  await login(page, 'student');
  await page.goto(`/workspace/library/reading-lists?courseId=${courseId}`);
  const list = page.getByRole('article', { name: 'Danh sách có hạn' });
  await expect(list.getByText(`Hạn đọc: ${due.toLocaleDateString('vi-VN')}`)).toBeVisible();
  const follow = page.getByLabel('Hiện hạn đọc của môn này trên Lịch học');
  await expect(follow).not.toBeChecked();
  // Not followed yet: the calendar has no deadline for this course.
  await page.goto('/workspace/calendar');
  await page.getByRole('button', { name: 'Lịch biểu', exact: true }).click();
  const deadlineName = `Hạn đọc: ${titles[0]}`;
  const deadline = page.getByRole('link', { name: deadlineName, exact: true });
  await expect(page.getByRole('heading', { name: /^Từ / })).toBeVisible();
  await expect(deadline).toHaveCount(0);

  await page.goto(`/workspace/library/reading-lists?courseId=${courseId}`);
  await follow.check();
  await expect(page.getByText('Hạn đọc của môn này sẽ hiện trên Lịch học.')).toBeVisible();
  await page.reload();
  await expect(follow).toBeChecked();
  await page.getByRole('link', { name: 'Mở Lịch học', exact: true }).click();
  await page.getByRole('button', { name: 'Lịch biểu', exact: true }).click();
  await expect(deadline).toHaveCount(1);
  const entry = page.locator('.calendar-agenda li').filter({ has: deadline });
  await expect(entry).toContainText(`${code} · Danh sách có hạn · Tuần 1`);
  await expect(entry.getByRole('link', { name: 'Xem danh sách đọc' })).toHaveAttribute(
    'href',
    `/workspace/library/reading-lists?courseId=${courseId}`,
  );
  // The month view shows the same date as a read-only chip.
  await page.getByRole('button', { name: 'Tháng', exact: true }).click();
  if (due.getMonth() !== new Date().getMonth())
    await page.getByRole('button', { name: 'Khoảng sau', exact: true }).click();
  await expect(
    page.locator('.calendar-month').getByRole('link', { name: deadlineName }),
  ).toHaveCount(1);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await deadline.click();
  await expect(page).toHaveURL(/\/workspace\/library\/versions\/\d+$/);
  await expect(page.getByRole('heading', { name: titles[0] })).toBeVisible({ timeout: 15_000 });

  // CAL-04c: once marked read, the deadline says so and is struck through.
  await page.goto(`/workspace/library/reading-lists?courseId=${courseId}`);
  await list.getByRole('checkbox', { name: `Đã đọc: ${titles[0]}`, exact: true }).check();
  await expect(list.getByText('Đã đọc 1/1 tài liệu')).toBeVisible();
  await page.goto('/workspace/calendar');
  await page.getByRole('button', { name: 'Lịch biểu', exact: true }).click();
  const done = page.getByRole('link', { name: `${deadlineName} · Đã đọc`, exact: true });
  await expect(done).toHaveCount(1);
  await expect(done).toHaveCSS('text-decoration-line', 'line-through');
  await expect(deadline).toHaveCount(0);
  // Unfollowing removes the date again.
  await page.goto(`/workspace/library/reading-lists?courseId=${courseId}`);
  await follow.uncheck();
  await expect(page.getByText('Đã bỏ hạn đọc khỏi Lịch học.')).toBeVisible();
  await page.goto('/workspace/calendar');
  await page.getByRole('button', { name: 'Lịch biểu', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Từ / })).toBeVisible();
  await expect(deadline).toHaveCount(0);
});

test('COURSE-02: a student marks listed materials as read and sees progress only for themselves', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { code, courseId, titles } = await courseWithMaterials(page, 'course2');
  await login(page, 'lecturer', 'course2');
  const found = (await (await page.request.get(`/api/v1/library?search=${code}`)).json()).items as {
    versionId: string;
    title: string;
  }[];
  const versionOf = (title: string) => found.find((i) => i.title === title)!.versionId;
  expect(
    (
      await page.request.put(`/api/v1/courses/${courseId}/reading-lists/mine`, {
        headers: await readerHeaders(page),
        data: {
          title: 'Danh sách theo dõi đọc',
          published: true,
          revision: 0,
          items: titles.map((title) => ({ section: '', versionId: versionOf(title), note: '' })),
        },
      })
    ).status(),
  ).toBe(200);
  await readerLogout(page);

  await login(page, 'student', 'course2');
  await page.goto(`/workspace/library/reading-lists?courseId=${courseId}`);
  const list = page.getByRole('article', { name: 'Danh sách theo dõi đọc' });
  await expect(list.getByText('Đã đọc 0/2 tài liệu')).toBeVisible();
  const first = list.getByRole('checkbox', { name: `Đã đọc: ${titles[0]}`, exact: true });
  await first.check();
  await expect(page.getByRole('status').filter({ hasText: 'Đã đánh dấu đã đọc' })).toHaveText(
    `Đã đánh dấu đã đọc: ${titles[0]}.`,
  );
  await expect(list.getByText('Đã đọc 1/2 tài liệu')).toBeVisible();
  await page.reload();
  await expect(first).toBeChecked();
  await expect(list.getByText('Đã đọc 1/2 tài liệu')).toBeVisible();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  // A failed save puts the box back and says why.
  const second = list.getByRole('checkbox', { name: `Đã đọc: ${titles[1]}`, exact: true });
  await page.route('**/reading-lists/read/*', (route) => route.abort('failed'), { times: 1 });
  await second.check();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Chưa kết nối được máy chủ' }),
  ).toBeVisible();
  await expect(second).not.toBeChecked();
  await expect(list.getByText('Đã đọc 1/2 tài liệu')).toBeVisible();
  await first.uncheck();
  await expect(page.getByRole('status').filter({ hasText: 'Đã bỏ dấu đã đọc' })).toBeVisible();
  await expect(list.getByText('Đã đọc 0/2 tài liệu')).toBeVisible();
  await first.check();
  await expect(list.getByText('Đã đọc 1/2 tài liệu')).toBeVisible();
  await readerLogout(page);

  // The mark is private: the lecturer reading the same list sees none of it.
  await login(page, 'lecturer', 'course2');
  await page.goto(`/workspace/library/reading-lists?courseId=${courseId}`);
  await expect(list.getByText('Đã đọc 0/2 tài liệu')).toBeVisible();
});

test('home: followed courses show reading progress and the nearest unread due date', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { code, courseId, titles } = await courseWithMaterials(page, 'course3');
  const pad = (n: number) => String(n).padStart(2, '0');
  const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const past = new Date();
  past.setDate(past.getDate() - 2);
  const soon = new Date();
  soon.setDate(soon.getDate() + 5);
  await login(page, 'lecturer', 'course3');
  const found = (await (await page.request.get(`/api/v1/library?search=${code}`)).json()).items as {
    versionId: string;
    title: string;
  }[];
  const versionOf = (title: string) => found.find((i) => i.title === title)!.versionId;
  expect(
    (
      await page.request.put(`/api/v1/courses/${courseId}/reading-lists/mine`, {
        headers: await readerHeaders(page),
        data: {
          title: 'Danh sách trang đầu',
          published: true,
          revision: 0,
          items: [
            { section: '', versionId: versionOf(titles[0]), note: '', dueOn: key(past) },
            { section: '', versionId: versionOf(titles[1]), note: '', dueOn: key(soon) },
          ],
        },
      })
    ).status(),
  ).toBe(200);
  await readerLogout(page);

  await login(page, 'student', 'course3');
  // A failed load says so in this section only and retries in place.
  let fail = true;
  await page.route('**/api/v1/reading-lists/following', (route) =>
    fail ? route.abort('failed') : route.continue(),
  );
  await page.goto('/workspace/student');
  const section = page.getByRole('region', { name: 'Danh sách đọc đang theo dõi' });
  const row = section.getByRole('listitem').filter({ hasText: code });
  await expect(section.getByRole('alert')).toContainText('Chưa kết nối được máy chủ');
  fail = false;
  await section.getByRole('button', { name: 'Tải lại tiến độ đọc', exact: true }).click();
  await expect(section.getByRole('alert')).toHaveCount(0);
  await expect(section.getByRole('status')).toHaveCount(0);
  await expect(row).toHaveCount(0);
  await page.goto(`/workspace/library/reading-lists?courseId=${courseId}`);
  await page.getByLabel('Hiện hạn đọc của môn này trên Lịch học').check();
  await expect(page.getByText('Hạn đọc của môn này sẽ hiện trên Lịch học.')).toBeVisible();

  await page.goto('/workspace/student');
  await expect(row).toContainText('Đã đọc 0/2 tài liệu');
  await expect(row.locator('.home-overdue')).toContainText(
    `Quá hạn ${past.toLocaleDateString('vi-VN')}: ${titles[0]}`,
  );
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  // Marking the overdue item right here moves on to the next unread due date; a failed save
  // says so and leaves the progress as it was.
  await page.route('**/reading-lists/read/*', (route) => route.abort('failed'), { times: 1 });
  const markFirst = row.getByRole('button', { name: `Đánh dấu đã đọc: ${titles[0]}`, exact: true });
  await markFirst.click();
  await expect(section.getByRole('alert')).toContainText('Chưa kết nối được máy chủ');
  await expect(row).toContainText('Đã đọc 0/2 tài liệu');
  await markFirst.click();
  await expect(section.getByRole('status')).toHaveText(`Đã đánh dấu đã đọc: ${titles[0]}.`);
  await expect(section.getByRole('alert')).toHaveCount(0);
  await expect(row).toContainText('Đã đọc 1/2 tài liệu');
  await page.getByRole('link', { name: `${code} · Môn có danh sách đọc`, exact: true }).click();
  await expect(page).toHaveURL(`/workspace/library/reading-lists?courseId=${courseId}`);
  const list = page.getByRole('article', { name: 'Danh sách trang đầu' });
  await expect(
    list.getByRole('checkbox', { name: `Đã đọc: ${titles[0]}`, exact: true }),
  ).toBeChecked();
  await page.goto('/workspace/student');
  await expect(row).toContainText(`Hạn gần nhất ${soon.toLocaleDateString('vi-VN')}: ${titles[1]}`);
  await expect(row.locator('.home-overdue')).toHaveCount(0);
  await page.goto(`/workspace/library/reading-lists?courseId=${courseId}`);
  await list.getByRole('checkbox', { name: `Đã đọc: ${titles[1]}`, exact: true }).check();
  await expect(list.getByText('Đã đọc 2/2 tài liệu')).toBeVisible();
  await page.goto('/workspace/student');
  await expect(row).toContainText('Đã đọc hết 2 tài liệu');
  await expect(row.getByRole('paragraph')).toHaveCount(0);
  await row.getByRole('link').click();
  await page.getByLabel('Hiện hạn đọc của môn này trên Lịch học').uncheck();
  await expect(page.getByText('Đã bỏ hạn đọc khỏi Lịch học.')).toBeVisible();
  await page.goto('/workspace/student');
  await expect(section.getByRole('heading', { name: 'Danh sách đọc đang theo dõi' })).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('CAL-07: due times, read marks and reminders from the calendar, and change notices', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const { code, courseId, titles } = await courseWithMaterials(page, 'course4');
  const due = new Date();
  due.setDate(due.getDate() + 3);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dueKey = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
  // The lecturer gives the due date a time (Vietnam time).
  await login(page, 'lecturer', 'course4');
  await page.goto('/workspace/lecturer/reading-lists');
  await page.getByRole('combobox', { name: 'Môn được phân công', exact: true }).click();
  await page.getByRole('option', { name: `${code} · Môn có danh sách đọc`, exact: true }).click();
  await page.getByLabel('Tên danh sách', { exact: true }).fill('Danh sách có giờ');
  await page.getByLabel('Tìm tài liệu của môn để thêm', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Tìm tài liệu', exact: true }).click();
  await page.getByRole('button', { name: `Thêm vào danh sách: ${titles[0]}`, exact: true }).click();
  const time = page.getByLabel('Giờ hạn (giờ Việt Nam)').first();
  await expect(time).toBeDisabled();
  await page.getByLabel('Hạn đọc (không bắt buộc)').first().fill(dueKey);
  await time.fill('09:00');
  await page.getByLabel('Công bố cho người đọc của môn').check();
  await page.getByRole('button', { name: 'Lưu danh sách', exact: true }).click();
  await expect(page.getByText('Đã lưu. Người đọc của môn thấy danh sách này.')).toBeVisible();
  await expect(time).toHaveValue('09:00');
  await readerLogout(page);

  await login(page, 'student', 'course4');
  const headers = await readerHeaders(page);
  expect(
    (
      await page.request.put(`/api/v1/courses/${courseId}/reading-lists/follow`, {
        headers,
        data: { following: true },
      })
    ).status(),
  ).toBe(200);
  await page.goto('/workspace/calendar');
  await page.getByRole('button', { name: 'Lịch biểu', exact: true }).click();
  const name = `Hạn đọc 09:00: ${titles[0]}`;
  await expect(page.getByRole('link', { name, exact: true })).toHaveCount(1);
  // Followed courses in one place; a reminder chosen there is saved.
  const followed = page.getByRole('complementary', { name: 'Môn đang theo dõi' });
  await expect(
    followed.getByRole('link', { name: `${code} · Môn có danh sách đọc` }),
  ).toBeVisible();
  await followed.getByRole('combobox', { name: `Nhắc hạn đọc ${code}`, exact: true }).click();
  await page.getByRole('option', { name: 'Trước 1 ngày', exact: true }).click();
  await expect(followed.getByRole('status')).toHaveText(
    `${code}: nhắc trước 1 ngày mỗi hạn đọc chưa đọc.`,
  );
  // Ticked read from the calendar, then hidden with the toggle.
  await page.getByRole('checkbox', { name: `Đã đọc: ${titles[0]}`, exact: true }).check();
  await expect(page.getByRole('link', { name: `${name} · Đã đọc`, exact: true })).toHaveCount(1);
  await expect(followed).toContainText('Đã đọc 1/1');
  await page.reload();
  await page.getByRole('button', { name: 'Lịch biểu', exact: true }).click();
  await expect(page.getByRole('link', { name: `${name} · Đã đọc`, exact: true })).toHaveCount(1);
  await page.getByLabel('Ẩn hạn đọc đã đọc', { exact: true }).check();
  await expect(page.getByRole('link', { name: `${name} · Đã đọc`, exact: true })).toHaveCount(0);
  await page.getByLabel('Ẩn hạn đọc đã đọc', { exact: true }).uncheck();
  await page.getByRole('checkbox', { name: `Đã đọc: ${titles[0]}`, exact: true }).uncheck();
  await expect(page.getByRole('link', { name, exact: true })).toHaveCount(1);
  await readerLogout(page);

  // The lecturer moves the due time; the follower hears about it.
  await login(page, 'lecturer', 'course4');
  await page.goto('/workspace/lecturer/reading-lists');
  await page.getByRole('combobox', { name: 'Môn được phân công', exact: true }).click();
  await page.getByRole('option', { name: `${code} · Môn có danh sách đọc`, exact: true }).click();
  await page.getByLabel('Giờ hạn (giờ Việt Nam)').first().fill('17:30');
  await page.getByRole('button', { name: 'Lưu danh sách', exact: true }).click();
  await expect(page.getByText('Đã lưu. Người đọc của môn thấy danh sách này.')).toBeVisible();
  await readerLogout(page);
  await login(page, 'student', 'course4');
  await page.goto('/workspace/notifications');
  await expect(
    page.getByText(`Hạn đọc của “${titles[0]}” đổi sang 17:30 ${due.toLocaleDateString('vi-VN')}.`),
  ).toBeVisible();
  // Unfollowing from the calendar removes the course's dates.
  await page.goto('/workspace/calendar');
  await page.getByRole('button', { name: 'Lịch biểu', exact: true }).click();
  await expect(page.getByRole('link', { name: `Hạn đọc 17:30: ${titles[0]}` })).toHaveCount(1);
  await followed.getByRole('button', { name: `Bỏ theo dõi ${code}`, exact: true }).click();
  await expect(followed.getByRole('status')).toContainText(`Đã bỏ theo dõi ${code}.`);
  await expect(page.getByRole('link', { name: `Hạn đọc 17:30: ${titles[0]}` })).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
