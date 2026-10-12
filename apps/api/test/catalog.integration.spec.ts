import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { AcademicService } from '../src/academic/academic.service';

type Browser = ReturnType<typeof request.agent>;
const origin = 'http://127.0.0.1:3100';
const password = randomBytes(24).toString('base64url');
const prefix = `CAT-${randomBytes(5).toString('hex').toUpperCase()}`;

describe('academic catalog', () => {
  let app: INestApplication;
  let db: Client;
  let redis: Redis;
  let admin: Browser;
  const ids: string[] = [];
  const emails: Record<string, string> = {};
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? '');
    const redisUrl = new URL(process.env.TEST_REDIS_URL ?? '');
    if (!url.pathname.endsWith('_test') || redisUrl.pathname !== '/15')
      throw new Error('Isolated services required.');
    Object.assign(process.env, {
      DATABASE_URL: url.href,
      REDIS_URL: redisUrl.href,
      APP_ORIGIN: origin,
      NODE_ENV: 'test',
    });
    db = new Client({ connectionString: url.href });
    await db.connect();
    redis = new Redis(redisUrl.href);
    await redis.flushdb();
    const hash = await argon2.hash(password);
    for (const role of ['ADMIN', 'LECTURER', 'STUDENT']) {
      emails[role] = `${prefix.toLowerCase()}-${role.toLowerCase()}@example.test`;
      const result = await db.query(
        "INSERT INTO hucescholar.users(email,display_name,password_hash,role,status,verified_at) VALUES($1,$2,$3,$4,'ACTIVE',now()) RETURNING id",
        [emails[role], `Catalog fixture ${role}`, hash, role],
      );
      ids.push(result.rows[0].id);
    }
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    configureApplication(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    admin = request.agent(app.getHttpServer());
    await login(admin, 'ADMIN');
  });
  afterAll(async () => {
    await app?.close();
    if (db) {
      await db.query(
        'DELETE FROM hucescholar.lecturer_assignments WHERE lecturer_id=ANY($1::bigint[])',
        [ids],
      );
      await db.query('DELETE FROM hucescholar.audit_events WHERE actor_id=ANY($1::bigint[])', [
        ids,
      ]);
      await db.query(
        'DELETE FROM hucescholar.program_courses WHERE course_id IN (SELECT id FROM hucescholar.courses WHERE code LIKE $1)',
        [`${prefix}%`],
      );
      await db.query('DELETE FROM hucescholar.courses WHERE code LIKE $1', [`${prefix}%`]);
      await db.query('DELETE FROM hucescholar.programs WHERE code LIKE $1', [`${prefix}%`]);
      await db.query('DELETE FROM hucescholar.faculties WHERE code LIKE $1', [`${prefix}%`]);
      await db.query('DELETE FROM hucescholar.auth_sessions WHERE user_id=ANY($1::bigint[])', [
        ids,
      ]);
      await db.query('DELETE FROM hucescholar.users WHERE id=ANY($1::bigint[])', [ids]);
      await db.end();
    }
    await redis?.quit();
  });
  async function csrf(browser = admin) {
    return (await browser.get('/api/v1/auth/csrf').expect(200)).body.csrfToken as string;
  }
  async function login(browser: Browser, role: string) {
    const token = await csrf(browser);
    await browser
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({ email: emails[role], password })
      .expect(200);
  }
  async function write(
    path: string,
    body: object,
    method: 'post' | 'patch' = 'post',
    browser = admin,
  ) {
    const token = await csrf(browser);
    return browser[method](`/api/v1/admin/catalog/${path}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send(body);
  }
  async function faculty(suffix: string) {
    const result = await write('faculties', {
      code: `${prefix}-${suffix}`,
      name: `Khoa ${suffix}`,
    });
    expect(result.status).toBe(201);
    return result.body.item as {
      id: string;
      code: string;
      name: string;
      active: boolean;
      revision: number;
    };
  }
  async function course(suffix: string) {
    const parent = await faculty(suffix);
    const result = await write('courses', {
      code: `${prefix}-${suffix}`,
      name: `Môn ${suffix}`,
      facultyId: parent.id,
    });
    expect(result.status).toBe(201);
    return result.body.item as { id: string; code: string; name: string; revision: number };
  }
  async function assignment(body: object, id?: string, browser = admin) {
    const token = await csrf(browser);
    return browser[id ? 'patch' : 'post'](`/api/v1/admin/assignments${id ? `/${id}/revoke` : ''}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send(body);
  }
  it('restricts assignments and scopes lecturer reads to their own ID', async () => {
    const item = await course('OWN');
    await request(app.getHttpServer()).get('/api/v1/admin/assignments').expect(401);
    const lecturer = request.agent(app.getHttpServer());
    await login(lecturer, 'LECTURER');
    await lecturer.get('/api/v1/admin/assignments').expect(403);
    expect((await assignment({}, undefined, lecturer)).status).toBe(403);
    const student = request.agent(app.getHttpServer());
    await login(student, 'STUDENT');
    await student.get('/api/v1/lecturer/assignments').expect(403);
    const created = await assignment({ lecturerId: ids[1], courseId: item.id });
    expect(created.status).toBe(201);
    const other = await db.query(
      "INSERT INTO hucescholar.users(email,display_name,password_hash,role,status,verified_at) SELECT $1,'Other lecturer',password_hash,'LECTURER','ACTIVE',now() FROM hucescholar.users WHERE id=$2 RETURNING id",
      [`${prefix.toLowerCase()}-other@example.test`, ids[1]],
    );
    ids.push(other.rows[0].id);
    expect((await assignment({ lecturerId: other.rows[0].id, courseId: item.id })).status).toBe(
      201,
    );
    const own = await lecturer.get(`/api/v1/lecturer/assignments?search=${item.code}`).expect(200);
    expect(own.body.items).toHaveLength(1);
    expect(own.body.items[0]).toMatchObject({ lecturerId: ids[1], courseId: item.id });
    await lecturer.get(`/api/v1/lecturer/assignments?lecturerId=${ids[2]}`).expect(400);
    await admin.post('/api/v1/admin/assignments').send({}).expect(403);
  });
  it('rejects non-lecturers, locked accounts and stopped courses', async () => {
    const item = await course('ELIGIBLE');
    expect((await assignment({ lecturerId: ids[2], courseId: item.id })).body.code).toBe(
      'INVALID_LECTURER',
    );
    await db.query("UPDATE hucescholar.users SET status='LOCKED' WHERE id=$1", [ids[1]]);
    try {
      expect((await assignment({ lecturerId: ids[1], courseId: item.id })).body.code).toBe(
        'INVALID_LECTURER',
      );
    } finally {
      await db.query("UPDATE hucescholar.users SET status='ACTIVE' WHERE id=$1", [ids[1]]);
    }
    expect(
      (
        await write(
          `courses/${item.id}`,
          { code: item.code, name: item.name, active: false, revision: 1 },
          'patch',
        )
      ).status,
    ).toBe(200);
    expect((await assignment({ lecturerId: ids[1], courseId: item.id })).body.code).toBe(
      'INACTIVE_COURSE',
    );
    expect(
      (await assignment({ lecturerId: '9223372036854775808', courseId: item.id })).status,
    ).toBe(400);
  });
  it('serializes assignment versus course stop and rolls back assignment if audit fails', async () => {
    const item = await course('RACE');
    const results = await Promise.all([
      assignment({ lecturerId: ids[1], courseId: item.id }),
      write(
        `courses/${item.id}`,
        { code: item.code, name: item.name, active: false, revision: 1 },
        'patch',
      ),
    ]);
    expect(results.map((r) => r.status)).toEqual(expect.arrayContaining([409]));
    expect(results.some((r) => r.status === 200 || r.status === 201)).toBe(true);
    const violations = await db.query(
      'SELECT count(*)::int n FROM hucescholar.lecturer_assignments a JOIN hucescholar.courses c ON c.id=a.course_id WHERE c.id=$1 AND NOT c.is_active AND a.revoked_at IS NULL',
      [item.id],
    );
    expect(violations.rows[0].n).toBe(0);
    const rollback = await course('ASSIGN-ROLL');
    const spy = jest
      .spyOn(app.get(AcademicService), 'audit')
      .mockRejectedValueOnce(new Error('Simulated audit outage'));
    try {
      expect((await assignment({ lecturerId: ids[1], courseId: rollback.id })).status).toBe(500);
      expect(
        (
          await db.query(
            'SELECT count(*)::int n FROM hucescholar.lecturer_assignments WHERE course_id=$1',
            [rollback.id],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
  it('serializes duplicate assignment, retains revocation history and requires explicit revoke before stopping a course', async () => {
    const item = await course('HISTORY');
    const body = { lecturerId: ids[1], courseId: item.id };
    const concurrent = await Promise.all([assignment(body), assignment(body)]);
    expect(concurrent.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(concurrent.find((r) => r.status === 409)?.body.code).toBe('ALREADY_ASSIGNED');
    const created = concurrent.find((r) => r.status === 201)!.body.item;
    expect(
      (
        await write(
          `courses/${item.id}`,
          { code: item.code, name: item.name, active: false, revision: 1 },
          'patch',
        )
      ).body.code,
    ).toBe('ACTIVE_ASSIGNMENTS');
    expect((await assignment({ reason: ' ' }, created.id)).status).toBe(400);
    const revoked = await Promise.all([
      assignment({ reason: 'Đổi phân công học kỳ' }, created.id),
      assignment({ reason: 'Không ghi đè lịch sử' }, created.id),
    ]);
    expect(revoked.map((r) => r.status).sort()).toEqual([200, 409]);
    const again = await assignment(body);
    expect(again.status).toBe(201);
    expect(again.body.item.id).not.toBe(created.id);
    const history = await admin.get(`/api/v1/admin/assignments?courseId=${item.id}`).expect(200);
    expect(history.body.total).toBe(2);
    expect(
      history.body.items.filter((r: { revokedAt: string | null }) => r.revokedAt !== null),
    ).toHaveLength(1);
    const audit = await db.query(
      "SELECT count(*)::int n FROM hucescholar.audit_events WHERE actor_id=$1 AND entity_type='LECTURER_ASSIGNMENT' AND entity_id=$2 AND event_type='ASSIGNMENT_REVOKED'",
      [ids[0], created.id],
    );
    expect(audit.rows[0].n).toBe(1);
    expect((await assignment({ reason: 'Kết thúc phụ trách' }, again.body.item.id)).status).toBe(
      200,
    );
    expect(
      (
        await write(
          `courses/${item.id}`,
          { code: item.code, name: item.name, active: false, revision: 1 },
          'patch',
        )
      ).status,
    ).toBe(200);
    const filtered = await admin
      .get(`/api/v1/admin/assignments?courseId=${item.id}&status=REVOKED&limit=1&page=2`)
      .expect(200);
    expect(filtered.body).toMatchObject({ total: 2, limit: 1, page: 2 });
    expect(filtered.body.items).toHaveLength(1);
  });
  it('restricts catalog reads and writes to ADMIN, with CSRF on mutations', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/catalog/faculties').expect(401);
    for (const role of ['LECTURER', 'STUDENT']) {
      const browser = request.agent(app.getHttpServer());
      await login(browser, role);
      await browser.get('/api/v1/admin/catalog/faculties').expect(403);
      expect((await write('faculties', {}, 'post', browser)).status).toBe(403);
    }
    await admin.post('/api/v1/admin/catalog/faculties').send({ code: 'X', name: 'X' }).expect(403);
  });
  it('creates normalized faculty, reads it and persists its audit', async () => {
    const result = await write('faculties', {
      code: ` ${prefix.toLowerCase()}-one `,
      name: ' Khoa thử nghiệm ',
    });
    expect(result.status).toBe(201);
    expect(result.body.item).toMatchObject({
      code: `${prefix}-ONE`,
      name: 'Khoa thử nghiệm',
      active: true,
      revision: 1,
    });
    expect(typeof result.body.item.id).toBe('string');
    await admin.get(`/api/v1/admin/catalog/faculties/${result.body.item.id}`).expect(200);
    const audit = await db.query(
      'SELECT event_type FROM hucescholar.audit_events WHERE actor_id=$1 AND entity_id=$2',
      [ids[0], result.body.item.id],
    );
    expect(audit.rows).toContainEqual({ event_type: 'FACULTY_CREATED' });
  });
  it('rejects duplicate codes, invalid names, IDs, extra fields and queries', async () => {
    const item = await faculty('DUPE');
    expect(
      (await write('faculties', { code: item.code.toLowerCase(), name: 'Khác' })).body.code,
    ).toBe('CODE_TAKEN');
    for (const body of [
      { code: 'A B', name: 'X' },
      { code: 'A', name: ' ' },
      { code: 'A', name: 'X', unexpected: true },
    ])
      expect((await write('faculties', body)).status).toBe(400);
    await admin.get('/api/v1/admin/catalog/faculties/9223372036854775808').expect(400);
    await admin.get('/api/v1/admin/catalog/faculties?page=0').expect(400);
    await admin.get('/api/v1/admin/catalog/unknown').expect(400);
  });
  it('requires an active faculty for programs and blocks parent deactivation atomically', async () => {
    const parent = await faculty('PARENT');
    const result = await write('programs', {
      code: `${prefix}-PRG`,
      name: 'Ngành kiểm thử',
      facultyId: parent.id,
    });
    expect(result.status).toBe(201);
    const item = result.body.item;
    expect(item).toMatchObject({ facultyId: parent.id, revision: 1 });
    expect(
      (await write(`faculties/${parent.id}`, { ...parent, id: undefined, active: false }, 'patch'))
        .body.code,
    ).toBe('ACTIVE_CHILDREN');
    expect(
      (await admin.get(`/api/v1/admin/catalog/faculties/${parent.id}`)).body.item.revision,
    ).toBe(1);
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM hucescholar.audit_events WHERE actor_id=$1 AND entity_id=$2 AND event_type='FACULTY_UPDATED'",
          [ids[0], parent.id],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (await write('programs', { code: `${prefix}-MISSING`, name: 'Thiếu khoa' })).status,
    ).toBe(400);
    expect(
      (
        await write(
          `programs/${item.id}`,
          { code: item.code, name: item.name, active: false, revision: 1, facultyId: parent.id },
          'patch',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await write(
          `programs/${item.id}`,
          { code: item.code, name: item.name, active: false, revision: 1 },
          'patch',
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await write(
          `faculties/${parent.id}`,
          { code: parent.code, name: parent.name, active: false, revision: 1 },
          'patch',
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await write('programs', {
          code: `${prefix}-INACTIVE`,
          name: 'Khoa ngừng',
          facultyId: parent.id,
        })
      ).body.code,
    ).toBe('INACTIVE_FACULTY');
    expect(
      (
        await write(
          `programs/${item.id}`,
          { code: item.code, name: item.name, active: true, revision: 2 },
          'patch',
        )
      ).body.code,
    ).toBe('INACTIVE_FACULTY');
    const list = await admin
      .get(`/api/v1/admin/catalog/programs?facultyId=${parent.id}`)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
  });
  it('links shared courses across faculties atomically, with stale and inactive checks', async () => {
    const a = await faculty('COURSE-A');
    const b = await faculty('COURSE-B');
    const pr = await write('programs', {
      code: `${prefix}-SHARED-P`,
      name: 'Ngành khác khoa',
      facultyId: b.id,
    });
    expect(pr.status).toBe(201);
    const program = pr.body.item;
    const cr = await write('courses', {
      code: `${prefix}-SHARED-C`,
      name: 'Môn dùng chung',
      facultyId: a.id,
    });
    expect(cr.status).toBe(201);
    const course = cr.body.item;
    const linked = await write(
      `courses/${course.id}/programs`,
      { programIds: [program.id], revision: 1 },
      'patch',
    );
    expect(linked.status).toBe(200);
    expect(linked.body.item.programs).toEqual([expect.objectContaining({ id: program.id })]);
    expect(
      (await write(`courses/${course.id}/programs`, { programIds: [], revision: 1 }, 'patch')).body
        .code,
    ).toBe('STALE_REVISION');
    expect(
      (
        await write(
          `courses/${course.id}/programs`,
          { programIds: [program.id, '9223372036854775807'], revision: 2 },
          'patch',
        )
      ).status,
    ).toBe(404);
    const unchanged = await admin.get(`/api/v1/admin/catalog/courses/${course.id}`).expect(200);
    expect(unchanged.body.item).toMatchObject({
      revision: 2,
      programs: [expect.objectContaining({ id: program.id })],
    });
    expect(
      (
        await write(
          `programs/${program.id}`,
          { code: program.code, name: program.name, active: false, revision: 1 },
          'patch',
        )
      ).status,
    ).toBe(200);
    // Historical inactive links may remain or be explicitly removed.
    expect(
      (
        await write(
          `courses/${course.id}/programs`,
          { programIds: [program.id], revision: 2 },
          'patch',
        )
      ).status,
    ).toBe(200);
    expect(
      (await write(`courses/${course.id}/programs`, { programIds: [], revision: 3 }, 'patch'))
        .status,
    ).toBe(200);
    expect(
      (
        await write(
          `courses/${course.id}/programs`,
          { programIds: [program.id], revision: 4 },
          'patch',
        )
      ).body.code,
    ).toBe('INACTIVE_PROGRAM');
    expect(
      (
        await write(
          `courses/${course.id}/programs`,
          { programIds: [program.id, program.id], revision: 4 },
          'patch',
        )
      ).status,
    ).toBe(400);
    const stopped = await write(
      `courses/${course.id}`,
      { code: course.code, name: course.name, active: false, revision: 4 },
      'patch',
    );
    expect(stopped.status).toBe(200);
  });
  it('rolls back the catalog mutation when audit cannot be written', async () => {
    const spy = jest
      .spyOn(app.get(AcademicService), 'audit')
      .mockRejectedValueOnce(new Error('Simulated audit outage'));
    try {
      expect(
        (await write('faculties', { code: `${prefix}-ROLLBACK`, name: 'Không lưu thiếu audit' }))
          .status,
      ).toBe(500);
      expect(
        (
          await db.query('SELECT count(*)::int n FROM hucescholar.faculties WHERE code=$1', [
            `${prefix}-ROLLBACK`,
          ])
        ).rows[0].n,
      ).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
  it('updates with revision, prevents concurrent overwrite and filters with pagination', async () => {
    const item = await faculty('EDIT');
    const changes = {
      code: item.code,
      name: 'Khoa đã cập nhật',
      active: false,
      revision: item.revision,
    };
    const responses = await Promise.all([
      write(`faculties/${item.id}`, changes, 'patch'),
      write(`faculties/${item.id}`, { ...changes, name: 'Không ghi đè' }, 'patch'),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(responses.find((r) => r.status === 409)?.body.code).toBe('STALE_REVISION');
    const list = await admin
      .get(`/api/v1/admin/catalog/faculties?search=${item.code}&status=INACTIVE&limit=1`)
      .expect(200);
    expect(list.body).toMatchObject({ total: 1, page: 1, limit: 1 });
    expect(list.body.items[0]).toMatchObject({ id: item.id, active: false, revision: 2 });
    expect(
      (await admin.get(`/api/v1/admin/catalog/faculties?search=${item.code}&page=2&limit=1`)).body
        .items,
    ).toEqual([]);
  });
});
