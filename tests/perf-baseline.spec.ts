import { expect, test, type Page } from './helpers/test';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { readerHeaders, readerLogin, readerLogout } from './helpers/reader-session';

/**
 * PERF-01 baseline. Opt-in (`PERF=1`): it seeds thousands of synthetic rows in the isolated
 * test DB and removes them afterwards. Numbers are a reproducible reference for later changes,
 * not targets: they come from `next dev`, loopback HTTP and an emulated slow CPU.
 */
test.skip(process.env.PERF !== '1', 'Opt-in: PERF=1 seeds a large synthetic library.');

const rows = Number(process.env.PERF_ROWS ?? 20000);
const pages = Number(process.env.PERF_PAGES ?? 400);
const cpuSlowdown = Number(process.env.PERF_CPU ?? 4);
const runs = 7;
const code = `PERF-${randomBytes(4).toString('hex').toUpperCase()}`;
const report: Record<string, unknown> = {
  code,
  rows,
  pages,
  cpuSlowdown,
  runs,
  startedAt: new Date().toISOString(),
};

function database() {
  const environment = parseEnv(readFileSync('.local/test.env', 'utf8'));
  const url = new URL(environment.TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test')) throw new Error('Isolated test database required.');
  const { Client } = createRequire(`${process.cwd()}/apps/api/package.json`)('pg');
  return new Client({ connectionString: url.href });
}
function summary(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    medianMs: sorted[Math.floor(sorted.length / 2)],
    maxMs: sorted.at(-1),
    samplesMs: samples,
  };
}

/** A synthetic text PDF: one Helvetica line per page and a unique word on the last page. */
function longPdf(count: number): Buffer {
  const objects: string[] = [];
  const kids = Array.from({ length: count }, (_, i) => `${4 + 2 * i} 0 R`).join(' ');
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${count} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (let i = 1; i <= count; i++) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * (i - 1)} 0 R >>`,
    );
    const lines = Array.from(
      { length: 40 },
      (_, line) =>
        `BT /F1 10 Tf 48 ${780 - line * 18} Td (Page ${i} line ${line + 1} structural mechanics study text) Tj ET`,
    );
    if (i === count) lines.push('BT /F1 14 Tf 48 40 Td (PERFNEEDLE) Tj ET');
    const content = lines.join('\n');
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  let out = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

let courseId = '';
let lecturerId = '';
let route = '';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(600_000);
  const page = await browser.newPage();
  await readerLogin(page, 'admin', 'perf');
  let headers = await readerHeaders(page);
  const faculty = await page.request.post('/api/v1/admin/catalog/faculties', {
    headers,
    data: { code, name: 'Khoa đo hiệu năng' },
  });
  const course = await page.request.post('/api/v1/admin/catalog/courses', {
    headers,
    data: { code, name: 'Môn đo hiệu năng', facultyId: (await faculty.json()).item.id },
  });
  expect(course.status()).toBe(201);
  courseId = (await course.json()).item.id;
  const db = database();
  await db.connect();
  try {
    lecturerId = String(
      (
        await db.query('SELECT id FROM hucescholar.users WHERE email=$1', [
          'e2e-perf-lecturer@example.test',
        ])
      ).rows[0].id,
    );
    const started = Date.now();
    // Same path the API takes: a DRAFT with its course, then APPROVED and current.
    await db.query(`
      DO $$
      DECLARE f bigint; d bigint; v bigint;
        subjects text[] := ARRAY['Cơ học kết cấu','Sức bền vật liệu','Kết cấu bê tông cốt thép',
          'Thủy lực công trình','Địa kỹ thuật','Kinh tế xây dựng','Quy hoạch đô thị','Trắc địa'];
        kinds text[] := ARRAY['Giáo trình','Bài giảng','Bài tập','Đề cương ôn tập'];
        types text[] := ARRAY['TEXTBOOK','LECTURE','EXERCISE','REFERENCE'];
        names text[] := ARRAY['Nguyễn Văn An','Trần Thị Bình','Lê Hoàng Cường','Phạm Thu Dung'];
      BEGIN
        FOR g IN 1..${rows} LOOP
          INSERT INTO hucescholar.files(uploaded_by, object_key, original_name, byte_size, sha256,
            scan_status, page_count, has_text_layer, checked_at)
          VALUES (${lecturerId}, 'perf/${code}/' || g || '.pdf', 'perf.pdf', 1000, repeat('0', 64),
            'SAFE', 10, true, now()) RETURNING id INTO f;
          INSERT INTO hucescholar.documents(kind, created_by, manager_id)
          VALUES ('LECTURER_MATERIAL', ${lecturerId}, ${lecturerId}) RETURNING id INTO d;
          INSERT INTO hucescholar.document_versions(document_id, version_no, file_id, created_by,
            title, authors, material_type, source_reference, rights_basis)
          VALUES (d, 1, f, ${lecturerId},
            kinds[1 + g % 4] || ' ' || subjects[1 + g % 8] || ' tập ' || g ||
              CASE WHEN g % 1000 = 0 THEN ' chuyên đề hiếm' ELSE '' END || ' ${code}',
            names[1 + g % 4], types[1 + g % 4], 'Tự biên soạn — đo hiệu năng',
            'Dữ liệu tổng hợp — đo hiệu năng') RETURNING id INTO v;
          INSERT INTO hucescholar.version_courses(version_id, course_id) VALUES (v, ${courseId});
          UPDATE hucescholar.document_versions SET review_status = 'APPROVED' WHERE id = v;
          UPDATE hucescholar.documents SET current_version_id = v WHERE id = d;
        END LOOP;
      END $$;`);
    await db.query('ANALYZE hucescholar.document_versions, hucescholar.version_search');
    report.seedMs = Date.now() - started;
  } finally {
    await db.end();
  }

  // One long PDF through the normal draft → review flow, with a synthetic scan verdict.
  await readerLogout(page);
  await readerLogin(page, 'student', 'perf');
  headers = await readerHeaders(page);
  const draft = await page.request.post('/api/v1/material-drafts', {
    headers,
    data: {
      title: `Tài liệu dài ${code}`,
      authors: 'Tác giả minh họa',
      description: 'PDF tổng hợp nhiều trang để đo reader.',
      materialType: 'TEXTBOOK',
      sourceReference: 'Tự biên soạn — đo hiệu năng',
      rightsBasis: 'Dữ liệu tổng hợp — đo hiệu năng',
      downloadAllowed: false,
      courseIds: [courseId],
    },
  });
  const id = (await draft.json()).item.id as string;
  const pdf = longPdf(pages);
  report.pdfBytes = pdf.length;
  const upload = await page.request.post(`/api/v1/material-drafts/${id}/pdf`, {
    headers: {
      ...headers,
      'Content-Type': 'application/pdf',
      'X-File-Name': 'perf-long.pdf',
      'If-Match': '"1"',
    },
    data: pdf,
  });
  expect(upload.status()).toBe(201);
  const db2 = database();
  await db2.connect();
  try {
    await db2.query(
      "UPDATE hucescholar.files SET scan_status='SAFE',checked_at=now(),page_count=$2,has_text_layer=true WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE document_id=$1)",
      [id, pages],
    );
  } finally {
    await db2.end();
  }
  expect(
    (
      await page.request.post(`/api/v1/material-drafts/${id}/submit`, {
        headers,
        data: { revision: 2 },
      })
    ).status(),
  ).toBe(201);
  await readerLogout(page);
  await readerLogin(page, 'admin', 'perf');
  const request = (
    await (
      await page.request.get(
        `/api/v1/admin/publication-requests?search=${encodeURIComponent(code)}`,
      )
    ).json()
  ).items[0];
  const decision = await page.request.post(
    `/api/v1/admin/publication-requests/${request.id}/decision`,
    {
      headers: await readerHeaders(page),
      data: {
        revision: request.revision,
        submittedRevision: request.submittedRevision,
        outcome: 'APPROVED',
        reason: 'Dữ liệu tổng hợp',
        rightsConfirmed: true,
      },
    },
  );
  expect(decision.status()).toBe(201);
  route = `/workspace/library/versions/${request.versionId}`;
  await page.close();
});

test.afterAll(async () => {
  const db = database();
  await db.connect();
  try {
    // Terminal versions are immutable by design; the guards are lifted only for this cleanup.
    await db.query('BEGIN');
    await db.query('ALTER TABLE hucescholar.document_versions DISABLE TRIGGER tr_protect_version');
    await db.query(
      'ALTER TABLE hucescholar.version_courses DISABLE TRIGGER tr_protect_version_courses',
    );
    const seeded = "SELECT id FROM hucescholar.files WHERE object_key LIKE 'perf/' || $1 || '/%'";
    await db.query(
      `UPDATE hucescholar.documents SET current_version_id=NULL WHERE id IN (SELECT document_id FROM hucescholar.document_versions WHERE file_id IN (${seeded}))`,
      [code],
    );
    await db.query(
      `DELETE FROM hucescholar.version_courses WHERE version_id IN (SELECT id FROM hucescholar.document_versions WHERE file_id IN (${seeded}))`,
      [code],
    );
    const docs = await db.query(
      `DELETE FROM hucescholar.document_versions WHERE file_id IN (${seeded}) RETURNING document_id`,
      [code],
    );
    await db.query('DELETE FROM hucescholar.documents WHERE id = ANY($1::bigint[])', [
      docs.rows.map((r: { document_id: string }) => r.document_id),
    ]);
    await db.query("DELETE FROM hucescholar.files WHERE object_key LIKE 'perf/' || $1 || '/%'", [
      code,
    ]);
    await db.query('ALTER TABLE hucescholar.document_versions ENABLE TRIGGER tr_protect_version');
    await db.query(
      'ALTER TABLE hucescholar.version_courses ENABLE TRIGGER tr_protect_version_courses',
    );
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
  mkdirSync('test-results/perf', { recursive: true });
  writeFileSync('test-results/perf/baseline.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
});

async function timeRequest(page: Page, path: string) {
  const samples: number[] = [];
  let total = 0;
  await page.request.get(path); // warm-up: route compilation and query plans
  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    const response = await page.request.get(path);
    samples.push(Math.round(performance.now() - started));
    expect(response.status()).toBe(200);
    total = (await response.json()).total;
  }
  return { ...summary(samples), total };
}

test('library list and search over a large synthetic catalog', async ({ page }) => {
  test.setTimeout(300_000);
  await readerLogin(page, 'student', 'perf');
  const base = `/api/v1/library?limit=20&courseId=${courseId}`;
  const cases = {
    courseFirstPage: base,
    courseDeepPage: `${base}&page=500`,
    oneWord: `${base}&search=${encodeURIComponent('thuy luc')}`,
    threeWords: `${base}&search=${encodeURIComponent('giao trinh co hoc tap')}`,
    rareMatch: `${base}&search=${encodeURIComponent('chuyen de hiem')}`,
    noMatch: `${base}&search=${encodeURIComponent('khongcotrongthuvien')}`,
    wholeLibrary: '/api/v1/library?limit=20',
  };
  const results: Record<string, unknown> = {};
  for (const [name, path] of Object.entries(cases)) results[name] = await timeRequest(page, path);
  report.library = results;
  expect((results.courseFirstPage as { total: number }).total).toBeGreaterThanOrEqual(rows);
  expect((results.rareMatch as { total: number }).total).toBe(Math.floor(rows / 1000));
  // 'Giáo trình' (g % 4 = 0) and 'Cơ học kết cấu' (g % 8 = 0) coincide on every eighth row.
  expect((results.threeWords as { total: number }).total).toBe(Math.floor(rows / 8));
});

test('reader opens, jumps and searches a long PDF on an emulated slow CPU', async ({ page }) => {
  test.setTimeout(600_000);
  await readerLogin(page, 'student', 'perf');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
  const first: number[] = [],
    jump: number[] = [],
    find: number[] = [];
  for (let i = 0; i < 3; i++) {
    let started = performance.now();
    await page.goto(`${route}?page=1`);
    await expect(
      page.getByRole('status').filter({ hasText: `Đã hiển thị trang 1 / ${pages}` }),
    ).toBeVisible({ timeout: 120_000 });
    first.push(Math.round(performance.now() - started));
    await page.getByLabel('Số trang', { exact: true }).fill(String(pages));
    started = performance.now();
    await expect(
      page.getByRole('status').filter({ hasText: `Đã hiển thị trang ${pages} / ${pages}` }),
    ).toBeVisible({ timeout: 120_000 });
    jump.push(Math.round(performance.now() - started));
    const panel = page.getByRole('region', { name: 'Tìm chữ trong PDF' });
    if (!(await panel.isVisible()))
      await page.getByRole('button', { name: 'Tìm trong PDF', exact: true }).click();
    await panel.getByLabel('Chữ cần tìm trong PDF', { exact: true }).fill('PERFNEEDLE');
    started = performance.now();
    await panel.getByRole('button', { name: 'Tìm chữ', exact: true }).click();
    await expect(
      panel.getByRole('status').filter({ hasText: /kết quả · Đã tìm (\d+) \/ \1 trang/ }),
    ).toBeVisible({ timeout: 300_000 });
    find.push(Math.round(performance.now() - started));
  }
  report.reader = {
    firstPage: summary(first),
    jumpToLast: summary(jump),
    findWholeDocument: summary(find),
  };
});
