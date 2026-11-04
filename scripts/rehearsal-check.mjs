// OPS-02 rehearsal check. `flow` seeds accounts and walks upload → scan → publish → read through
// Caddy, then records what it saw in .local/rehearsal-state.json. `verify` repeats the reads
// after a restore and compares them. Local evidence only: Caddy's CA and Garage, not AWS.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Caddy's internal CA is not in Node's trust store; this process only talks to the rehearsal.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(`${root}apps/api/package.json`);
const { Client } = require('pg');
const argon2 = require('argon2');
const env = Object.fromEntries(
  readFileSync(`${root}infra/.env.rehearsal`, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);
const origin = 'https://localhost:8443';
const stateFile = `${root}.local/rehearsal-state.json`;
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const results = [];
function check(name, passed, detail = '') {
  results.push(passed);
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function pdf() {
  const text = `HUCEScholar OPS-02 rehearsal ${randomBytes(4).toString('hex')}`;
  const stream = `BT /F1 18 Tf 48 760 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.7\n';
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

class Session {
  cookies = new Map();
  async request(path, options = {}) {
    const headers = { Origin: origin, ...options.headers };
    if (this.cookies.size)
      headers.Cookie = [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    const response = await fetch(`${origin}${path}`, { ...options, headers });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      this.cookies.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1));
    }
    return response;
  }
  async write(path, body, headers = {}) {
    const csrf = (await (await this.request('/api/v1/auth/csrf')).json()).csrfToken;
    const raw = Buffer.isBuffer(body);
    return this.request(path, {
      method: 'POST',
      body: raw ? body : JSON.stringify(body),
      headers: {
        'X-CSRF-Token': csrf,
        ...(raw ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
    });
  }
  async login(email, password) {
    const response = await this.write('/api/v1/auth/login', { email, password });
    if (!response.ok) throw new Error(`Login ${email}: ${response.status}`);
    return response;
  }
}

async function database(run) {
  const db = new Client({
    connectionString: `postgresql://hucescholar:${env.POSTGRES_PASSWORD}@127.0.0.1:55532/hucescholar`,
  });
  await db.connect();
  try {
    return await run(db);
  } finally {
    await db.end();
  }
}

async function readBack(session, state) {
  const full = await session.request(`/api/v1/library/versions/${state.versionId}/pdf`);
  const bytes = Buffer.from(await full.arrayBuffer());
  check(
    'PDF body matches upload',
    full.ok && sha256(bytes) === state.sha256,
    `HTTP ${full.status}`,
  );
  const part = await session.request(`/api/v1/library/versions/${state.versionId}/pdf`, {
    headers: { Range: 'bytes=5-24' },
  });
  const slice = Buffer.from(await part.arrayBuffer());
  check(
    'Range returns 206 and the right bytes',
    part.status === 206 && slice.equals(bytes.subarray(5, 25)),
    `${part.status} ${part.headers.get('content-range')}`,
  );
  const notes = await (
    await session.request(`/api/v1/library/versions/${state.versionId}/notes?pageNumber=1`)
  ).json();
  check(
    'Private note still on its version and page',
    notes.items?.some((item) => item.content === state.note),
  );
}

async function flow() {
  const password = randomBytes(18).toString('hex');
  const suffix = randomBytes(3).toString('hex');
  const lecturerEmail = `lecturer-${suffix}@example.test`;
  const studentEmail = `student-${suffix}@example.test`;
  const courseId = await database(async (db) => {
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const user = async (email, role) =>
      (
        await db.query(
          `INSERT INTO hucescholar.users(email,display_name,password_hash,role,status,verified_at)
           VALUES($1,$2,$3,$4,'ACTIVE',now()) RETURNING id`,
          [email, `${role} diễn tập`, hash, role],
        )
      ).rows[0].id;
    const admin = await user(`admin-${suffix}@example.test`, 'ADMIN');
    const lecturer = await user(lecturerEmail, 'LECTURER');
    await user(studentEmail, 'STUDENT');
    const code = `OPS${suffix}`.toUpperCase();
    const faculty = (
      await db.query('INSERT INTO hucescholar.faculties(code,name) VALUES($1,$1) RETURNING id', [
        code,
      ])
    ).rows[0].id;
    const course = (
      await db.query(
        'INSERT INTO hucescholar.courses(code,name,faculty_id) VALUES($1,$1,$2) RETURNING id',
        [code, faculty],
      )
    ).rows[0].id;
    await db.query(
      'INSERT INTO hucescholar.lecturer_assignments(lecturer_id,course_id,assigned_by) VALUES($1,$2,$3)',
      [lecturer, course, admin],
    );
    return String(course);
  });

  const anonymous = new Session();
  const csrf = await anonymous.request('/api/v1/auth/csrf');
  const cookie = csrf.headers.getSetCookie().join(' ');
  check(
    'CSRF cookie is __Host-, Secure, HttpOnly',
    /__Host-hs_csrf=/.test(cookie) && /Secure/i.test(cookie) && /HttpOnly/i.test(cookie),
  );

  const lecturer = new Session();
  const login = await lecturer.login(lecturerEmail, password);
  const session = login.headers
    .getSetCookie()
    .find((value) => value.startsWith('__Host-hs_session'));
  check(
    'Session cookie is __Host-, Secure, HttpOnly, SameSite=Lax',
    !!session &&
      /Secure/i.test(session) &&
      /HttpOnly/i.test(session) &&
      /SameSite=Lax/i.test(session),
  );

  const draft = await lecturer.write('/api/v1/material-drafts', {
    title: `Diễn tập OPS-02 ${suffix}`,
    authors: 'Tác giả minh họa',
    description: 'Tài liệu tự tạo cho diễn tập phục hồi.',
    materialType: 'EXERCISE',
    sourceReference: 'Tự biên soạn — minh họa',
    rightsBasis: 'Tác giả cho phép — minh họa',
    downloadAllowed: false,
    courseIds: [courseId],
  });
  if (draft.status !== 201) throw new Error(`Draft: ${draft.status} ${await draft.text()}`);
  const draftId = (await draft.json()).item.id;
  const file = pdf();
  const upload = await lecturer.write(`/api/v1/material-drafts/${draftId}/pdf`, file, {
    'Content-Type': 'application/pdf',
    'X-File-Name': 'dien-tap.pdf',
    'If-Match': '"1"',
  });
  const uploaded = await upload.json();
  check('PDF upload to S3 accepted', upload.status === 201, `HTTP ${upload.status}`);

  let scan = '';
  for (let attempt = 0; attempt < 60 && !['SAFE', 'FAILED'].includes(scan); attempt++) {
    await new Promise((done) => setTimeout(done, 2000));
    scan = await database(
      async (db) =>
        (await db.query('SELECT scan_status FROM hucescholar.files ORDER BY id DESC LIMIT 1'))
          .rows[0]?.scan_status,
    );
  }
  check('Worker scanned the S3 object with ClamAV and Poppler', scan === 'SAFE', scan);

  const current = (
    await (await lecturer.request(`/api/v1/material-drafts?search=${suffix}`)).json()
  ).items[0];
  const published = await lecturer.write(`/api/v1/material-drafts/${draftId}/publish`, {
    revision: current.revision ?? uploaded.item?.revision,
  });
  check('Lecturer published', published.ok, `HTTP ${published.status}`);
  const versionId = String(current.versionId);

  const student = new Session();
  await student.login(studentEmail, password);
  const note = `Ghi chú diễn tập ${suffix}`;
  const created = await student.write(`/api/v1/library/versions/${versionId}/notes`, {
    pageNumber: 1,
    content: note,
    requestId: randomUUID(),
  });
  check('Student saved a private note', created.status === 201, `HTTP ${created.status}`);
  const state = { versionId, sha256: sha256(file), note, studentEmail, lecturerEmail, password };
  await readBack(student, state);

  const stranger = await anonymous.request(`/api/v1/library/versions/${versionId}/pdf`);
  check('Anonymous reader is refused', stranger.status === 401, `HTTP ${stranger.status}`);
  const direct = await fetch('http://127.0.0.1:53900/hucescholar-private/');
  check('Bucket refuses anonymous listing', direct.status === 403, `HTTP ${direct.status}`);

  // A client must not pick its own limiter bucket by sending X-Forwarded-For.
  const spoof = new Session();
  let limited = 0;
  for (let attempt = 0; attempt < 40 && !limited; attempt++) {
    const response = await spoof.write(
      '/api/v1/auth/login',
      { email: `nobody-${suffix}@example.test`, password: 'wrong-password-value' },
      { 'X-Forwarded-For': `203.0.113.${attempt + 1}` },
    );
    if (response.status === 429) limited = attempt + 1;
  }
  check(
    'Spoofed X-Forwarded-For does not escape the limiter',
    limited > 0,
    `429 at try ${limited}`,
  );

  mkdirSync(`${root}.local`, { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
}

async function verify() {
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  const student = new Session();
  await student.login(state.studentEmail, state.password);
  check('Account logs in after restore', true);
  await readBack(student, state);
}

const mode = process.argv[2];
if (mode !== 'flow' && mode !== 'verify') throw new Error('Usage: rehearsal-check.mjs flow|verify');
await (mode === 'flow' ? flow() : verify());
const failed = results.filter((passed) => !passed).length;
console.log(`${results.length - failed}/${results.length} checks passed.`);
process.exitCode = failed ? 1 : 0;
