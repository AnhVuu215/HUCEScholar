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
import { MaterialsService } from '../src/materials/materials.service';
import { PrivateStore } from '../src/files/private-store';
import { ScanQueue } from '../src/files/scan-queue';
import { ScanProcessor } from '../src/files/scan-processor';
import { PdfScanner } from '../src/files/pdf-scanner';
import { createReadStream } from 'node:fs';
import { DatabaseService } from '../src/database/database.module';

type Browser = ReturnType<typeof request.agent>;
const origin = 'http://127.0.0.1:3100';
const prefix = `mat-${randomBytes(5).toString('hex')}`;
const password = randomBytes(24).toString('base64url');

describe('private material drafts', () => {
  let app: INestApplication;
  let db: Client;
  let redis: Redis;
  const users: Record<string, string> = {};
  const agents: Record<string, Browser> = {};
  const courses: string[] = [];
  let faculty: string;
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
    for (const [name, role] of [
      ['admin', 'ADMIN'],
      ['lecturer', 'LECTURER'],
      ['student', 'STUDENT'],
      ['other', 'STUDENT'],
    ]) {
      users[name] = (
        await db.query(
          "INSERT INTO hucescholar.users(email,display_name,password_hash,role,status,verified_at) VALUES($1,$2,$3,$4,'ACTIVE',now()) RETURNING id",
          [`${prefix}-${name}@example.test`, `Material fixture ${name}`, hash, role],
        )
      ).rows[0].id;
    }
    faculty = (
      await db.query('INSERT INTO hucescholar.faculties(code,name) VALUES($1,$2) RETURNING id', [
        prefix,
        'Khoa kiểm thử học liệu',
      ])
    ).rows[0].id;
    for (let i = 0; i < 2; i++)
      courses.push(
        (
          await db.query(
            'INSERT INTO hucescholar.courses(code,name,faculty_id) VALUES($1,$2,$3) RETURNING id',
            [`${prefix}-${i}`, `Môn ${i}`, faculty],
          )
        ).rows[0].id,
      );
    await db.query(
      'INSERT INTO hucescholar.lecturer_assignments(lecturer_id,course_id,assigned_by) VALUES($1,$2,$3)',
      [users.lecturer, courses[0], users.admin],
    );
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    configureApplication(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    for (const name of Object.keys(users)) {
      const agent = request.agent(app.getHttpServer());
      const csrf = (await agent.get('/api/v1/auth/csrf')).body.csrfToken;
      await agent
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send({ email: `${prefix}-${name}@example.test`, password })
        .expect(200);
      agents[name] = agent;
    }
  });
  afterAll(async () => {
    if (app && db) {
      const keys = (
        await db.query(
          'SELECT object_key FROM hucescholar.files WHERE uploaded_by=ANY($1::bigint[])',
          [Object.values(users)],
        )
      ).rows;
      for (const row of keys) await app.get(PrivateStore).remove(row.object_key);
    }
    await app?.close();
    if (db) {
      const ids = Object.values(users);
      await db.query(
        'DELETE FROM hucescholar.version_courses WHERE version_id IN (SELECT id FROM hucescholar.document_versions WHERE created_by=ANY($1::bigint[]))',
        [ids],
      );
      await db.query(
        'DELETE FROM hucescholar.document_versions WHERE created_by=ANY($1::bigint[])',
        [ids],
      );
      await db.query('DELETE FROM hucescholar.documents WHERE created_by=ANY($1::bigint[])', [ids]);
      await db.query('DELETE FROM hucescholar.files WHERE uploaded_by=ANY($1::bigint[])', [ids]);
      await db.query('DELETE FROM hucescholar.audit_events WHERE actor_id=ANY($1::bigint[])', [
        ids,
      ]);
      await db.query(
        'DELETE FROM hucescholar.lecturer_assignments WHERE lecturer_id=ANY($1::bigint[])',
        [ids],
      );
      await db.query('DELETE FROM hucescholar.courses WHERE faculty_id=$1', [faculty]);
      await db.query('DELETE FROM hucescholar.faculties WHERE id=$1', [faculty]);
      await db.query('DELETE FROM hucescholar.auth_sessions WHERE user_id=ANY($1::bigint[])', [
        ids,
      ]);
      await db.query('DELETE FROM hucescholar.users WHERE id=ANY($1::bigint[])', [ids]);
      await db.end();
    }
    await redis?.quit();
  });
  function body() {
    return {
      title: '  Bản nháp minh họa  ',
      authors: 'Tác giả kiểm thử',
      description: '',
      materialType: 'EXERCISE',
      sourceReference: 'Tài liệu tự biên soạn',
      rightsBasis: 'Tác giả cho phép chia sẻ để học tập',
      downloadAllowed: false,
      courseIds: [courses[0]],
    };
  }
  async function write(name: string, data: object, id?: string) {
    const agent = agents[name];
    const csrf = (await agent.get('/api/v1/auth/csrf')).body.csrfToken;
    return agent[id ? 'patch' : 'post'](`/api/v1/material-drafts${id ? `/${id}` : ''}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send(data);
  }
  async function create(name = 'lecturer') {
    const result = await write(name, body());
    expect(result.status).toBe(201);
    return result.body.item;
  }
  async function upload(
    name: string,
    id: string,
    revision: number,
    bytes = Buffer.from('%PDF-1.7\nsynthetic test'),
    mime = 'application/pdf',
  ) {
    const agent = agents[name];
    const csrf = (await agent.get('/api/v1/auth/csrf')).body.csrfToken;
    return agent
      .post(`/api/v1/material-drafts/${id}/pdf`)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .set('If-Match', `"${revision}"`)
      .set('X-File-Name', encodeURIComponent('Tài liệu kiểm thử.pdf'))
      .set('Content-Type', mime)
      .send(bytes);
  }
  it('attaches a private immutable PDF as CHECKING and increments revision', async () => {
    const item = await create('student');
    const result = await upload('student', item.id, item.revision);
    expect(result.status).toBe(201);
    expect(result.body.item).toMatchObject({
      fileState: 'CHECKING',
      revision: 2,
      reviewStatus: 'DRAFT',
    });
    expect(JSON.stringify(result.body)).not.toMatch(/object_key|quarantine\/|sha256/);
    const file = (
      await db.query(
        'SELECT f.* FROM hucescholar.files f JOIN hucescholar.document_versions v ON v.file_id=f.id WHERE v.document_id=$1',
        [item.id],
      )
    ).rows[0];
    expect(file.scan_status).toBe('CHECKING');
    expect(Number(file.byte_size)).toBeGreaterThan(0);
    expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(file.page_count).toBeNull();
    const stale = await upload('student', item.id, 1);
    expect(stale.status).toBe(409);
  });
  it('rejects other owners, admin, missing CSRF and invalid PDF bytes', async () => {
    const item = await create('student');
    expect((await upload('other', item.id, 1)).status).toBe(404);
    expect((await upload('admin', item.id, 1)).status).toBe(403);
    expect(
      (
        await agents.student
          .post(`/api/v1/material-drafts/${item.id}/pdf`)
          .set('Content-Type', 'application/pdf')
          .send(Buffer.from('%PDF-1.7'))
      ).status,
    ).toBe(403);
    expect((await upload('student', item.id, 1, Buffer.from('not a PDF'))).status).toBe(400);
    expect(
      (await upload('student', item.id, 1, Buffer.from('%PDF-1.7'), 'application/octet-stream'))
        .status,
    ).toBe(400);
    expect(
      (await agents.student.get(`/api/v1/material-drafts/${item.id}`)).body.item.fileState,
    ).toBe('MISSING');
  });
  it('keeps a committed PDF CHECKING when enqueue fails for later reconciliation', async () => {
    const item = await create('student');
    const enqueue = jest
      .spyOn(app.get(ScanQueue), 'enqueue')
      .mockRejectedValueOnce(new Error('Unavailable'));
    const result = await upload('student', item.id, 1);
    enqueue.mockRestore();
    expect(result.status).toBe(201);
    expect(result.body.item.fileState).toBe('CHECKING');
  });
  it('rolls back PDF attachment and removes stored bytes when audit fails', async () => {
    const item = await create('student');
    const store = app.get(PrivateStore);
    const remove = jest.spyOn(store, 'remove');
    const audit = jest
      .spyOn(app.get(MaterialsService), 'audit')
      .mockRejectedValueOnce(new Error('Database unavailable'));
    const result = await upload('student', item.id, 1);
    audit.mockRestore();
    expect(result.status).toBe(503);
    expect(remove).toHaveBeenCalledTimes(1);
    remove.mockRestore();
    expect(
      (await agents.student.get(`/api/v1/material-drafts/${item.id}`)).body.item.fileState,
    ).toBe('MISSING');
  });
  async function uploadedFile(item: { id: string }) {
    return (
      await db.query(
        'SELECT f.* FROM hucescholar.files f JOIN hucescholar.document_versions v ON v.file_id=f.id WHERE v.document_id=$1',
        [item.id],
      )
    ).rows[0];
  }
  it('retains the private object when the database commit acknowledgment is lost', async () => {
    const item = await create('student');
    const database = app.get(DatabaseService);
    const original = database.$transaction.bind(database);
    let count = 0;
    const transaction = jest
      .spyOn(database, '$transaction')
      .mockImplementation(async (callback) => {
        const result = await original(callback);
        if (++count === 2) throw new Error('Commit acknowledgment lost');
        return result;
      });
    const remove = jest.spyOn(app.get(PrivateStore), 'remove');
    try {
      expect((await upload('student', item.id, 1)).status).toBe(503);
      expect(remove).not.toHaveBeenCalled();
    } finally {
      transaction.mockRestore();
      remove.mockRestore();
    }
    expect((await uploadedFile(item)).scan_status).toBe('CHECKING');
  });
  it('rechecks revision after storing bytes and preserves a concurrent metadata edit', async () => {
    const item = await create('student');
    const store = app.get(PrivateStore);
    const original = store.put.bind(store);
    const put = jest.spyOn(store, 'put').mockImplementationOnce(async (key, path, size) => {
      await original(key, path, size);
      expect(
        (await write('student', { ...body(), title: 'Newer metadata', revision: 1 }, item.id))
          .status,
      ).toBe(200);
    });
    const remove = jest.spyOn(store, 'remove');
    try {
      expect((await upload('student', item.id, 1)).status).toBe(409);
      expect(remove).toHaveBeenCalledTimes(1);
      expect(
        (await agents.student.get(`/api/v1/material-drafts/${item.id}`)).body.item,
      ).toMatchObject({ title: 'Newer metadata', revision: 2, fileState: 'MISSING' });
    } finally {
      put.mockRestore();
      remove.mockRestore();
    }
  });
  it('persists complete SAFE evidence once and leaves replacement files independent (scanner test double)', async () => {
    const item = await create('student');
    expect((await upload('student', item.id, 1)).status).toBe(201);
    const first = await uploadedFile(item);
    expect((await upload('student', item.id, 2)).status).toBe(201);
    const scan = jest
      .spyOn(app.get(PdfScanner), 'scan')
      .mockResolvedValue({ pageCount: 2, hasTextLayer: true });
    try {
      const processor = app.get(ScanProcessor);
      await processor.process(first.id, false);
      await processor.process(first.id, false);
      expect(scan).toHaveBeenCalledTimes(1);
      expect(
        (
          await db.query(
            'SELECT scan_status,page_count,has_text_layer,checked_at FROM hucescholar.files WHERE id=$1',
            [first.id],
          )
        ).rows[0],
      ).toMatchObject({
        scan_status: 'SAFE',
        page_count: 2,
        has_text_layer: true,
        checked_at: expect.any(Date),
      });
      expect(
        (await agents.student.get(`/api/v1/material-drafts/${item.id}`)).body.item.fileState,
      ).toBe('CHECKING');
    } finally {
      scan.mockRestore();
    }
  });
  it('retries scanner errors while CHECKING then records FAILED, never SAFE', async () => {
    const item = await create('student');
    await upload('student', item.id, 1);
    const file = await uploadedFile(item);
    const scan = jest
      .spyOn(app.get(PdfScanner), 'scan')
      .mockRejectedValue(new Error('Scanner offline'));
    try {
      await expect(app.get(ScanProcessor).process(file.id, false)).rejects.toThrow();
      expect((await uploadedFile(item)).scan_status).toBe('CHECKING');
      await expect(app.get(ScanProcessor).process(file.id, true)).rejects.toThrow();
      expect((await uploadedFile(item)).scan_status).toBe('FAILED');
    } finally {
      scan.mockRestore();
    }
  });
  it('rejects changed private bytes before scanning', async () => {
    const item = await create('student');
    await upload('student', item.id, 1);
    const file = await uploadedFile(item);
    const read = jest
      .spyOn(app.get(PrivateStore), 'read')
      .mockResolvedValue(createReadStream(__filename));
    const scan = jest.spyOn(app.get(PdfScanner), 'scan');
    try {
      await expect(app.get(ScanProcessor).process(file.id, true)).rejects.toThrow();
      expect(scan).not.toHaveBeenCalled();
      expect((await uploadedFile(item)).scan_status).toBe('FAILED');
    } finally {
      read.mockRestore();
      scan.mockRestore();
    }
  });
  it('reconciles a committed CHECKING file whose queue job is missing', async () => {
    const item = await create('student');
    const enqueue = jest
      .spyOn(app.get(ScanQueue), 'enqueue')
      .mockRejectedValueOnce(new Error('Queue unavailable'));
    await upload('student', item.id, 1);
    enqueue.mockRestore();
    const file = await uploadedFile(item);
    await app.get(ScanProcessor).reconcile();
    expect(await app.get(ScanQueue).queue.getJob(`file-${file.id}`)).toBeDefined();
  });
  it('requires a session, author role and CSRF', async () => {
    await request(app.getHttpServer()).get('/api/v1/material-drafts').expect(401);
    await agents.admin.get('/api/v1/material-drafts').expect(403);
    await agents.lecturer
      .post('/api/v1/material-drafts')
      .set('Origin', origin)
      .send(body())
      .expect(403);
  });
  it('persists a private draft and derives lecturer kind without a fake file', async () => {
    const item = await create();
    expect(item).toMatchObject({
      title: 'Bản nháp minh họa',
      kind: 'LECTURER_MATERIAL',
      reviewStatus: 'DRAFT',
      fileState: 'MISSING',
      revision: 1,
      editable: true,
    });
    expect(item.courses.map((c: { id: string }) => c.id)).toEqual([courses[0]]);
    const stored = (
      await db.query(
        'SELECT d.manager_id,d.current_version_id,v.file_id FROM hucescholar.documents d JOIN hucescholar.document_versions v ON v.document_id=d.id WHERE d.id=$1',
        [item.id],
      )
    ).rows[0];
    expect(stored).toEqual({ manager_id: users.lecturer, current_version_id: null, file_id: null });
    expect(JSON.stringify(item)).not.toMatch(/object_key|password|token_hash/);
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM hucescholar.audit_events WHERE actor_id=$1 AND event_type='MATERIAL_DRAFT_CREATED'",
          [users.lecturer],
        )
      ).rows[0].n,
    ).toBeGreaterThan(0);
  });
  it('keeps student contributions separate and hides other owners including admin', async () => {
    const item = await create('student');
    expect(item.kind).toBe('STUDENT_SUPPLEMENT');
    await agents.other.get(`/api/v1/material-drafts/${item.id}`).expect(404);
    await write('other', { ...body(), revision: item.revision }, item.id).then((r) =>
      expect(r.status).toBe(404),
    );
    await agents.admin.get(`/api/v1/material-drafts/${item.id}`).expect(403);
    const list = await agents.lecturer.get('/api/v1/material-drafts').expect(200);
    expect(list.body.items.some((row: { id: string }) => row.id === item.id)).toBe(false);
  });
  it('validates reserved fields, mandatory metadata and course IDs', async () => {
    for (const invalid of [
      { kind: 'STUDENT_SUPPLEMENT' },
      { managerId: users.other },
      { fileId: '1' },
      { reviewStatus: 'APPROVED' },
      { title: ' ' },
      { rightsBasis: ' ' },
      { sourceReference: ' ' },
      { courseIds: [] },
      { courseIds: [courses[0], courses[0]] },
      { courseIds: ['9223372036854775808'] },
      { materialType: 'FAKE' },
    ]) {
      expect((await write('student', { ...body(), ...invalid })).status).toBe(400);
    }
    await agents.student.get('/api/v1/material-drafts?managerId=1').expect(400);
    await agents.student.get('/api/v1/material-drafts/no-id').expect(400);
  });
  it('filters course choices by active faculty/course and current assignments', async () => {
    const own = await agents.lecturer.get('/api/v1/material-drafts/courses').expect(200);
    expect(own.body.items.map((c: { id: string }) => c.id)).toContain(courses[0]);
    expect(own.body.items.map((c: { id: string }) => c.id)).not.toContain(courses[1]);
    expect((await write('lecturer', { ...body(), courseIds: courses })).status).toBe(409);
    await db.query('UPDATE hucescholar.courses SET is_active=false WHERE id=$1', [courses[1]]);
    expect((await write('student', { ...body(), courseIds: [courses[1]] })).status).toBe(409);
    await db.query('UPDATE hucescholar.courses SET is_active=true WHERE id=$1', [courses[1]]);
    await db.query('UPDATE hucescholar.faculties SET is_active=false WHERE id=$1', [faculty]);
    expect((await write('student', body())).status).toBe(409);
    await db.query('UPDATE hucescholar.faculties SET is_active=true WHERE id=$1', [faculty]);
  });
  it('updates metadata and course links atomically; rejects stale revision', async () => {
    const item = await create('student');
    const updated = await write(
      'student',
      { ...body(), title: 'Đã sửa', courseIds: courses, revision: 1 },
      item.id,
    );
    expect(updated.status).toBe(200);
    expect(updated.body.item).toMatchObject({ title: 'Đã sửa', revision: 2 });
    expect(updated.body.item.courses).toHaveLength(2);
    const stale = await write('student', { ...body(), title: 'Ghi đè', revision: 1 }, item.id);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('STALE_REVISION');
    const current = await agents.student.get(`/api/v1/material-drafts/${item.id}`).expect(200);
    expect(current.body.item.title).toBe('Đã sửa');
  });
  it('allows exactly one concurrent write at a revision', async () => {
    const item = await create('student');
    const results = await Promise.all([
      write('student', { ...body(), title: 'A', revision: 1 }, item.id),
      write('student', { ...body(), title: 'B', revision: 1 }, item.id),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it('rolls back document/version/course writes when audit fails', async () => {
    const item = await create('student');
    const spy = jest
      .spyOn(app.get(MaterialsService), 'audit')
      .mockRejectedValueOnce(new Error('Synthetic audit failure'));
    try {
      expect(
        (
          await write(
            'student',
            { ...body(), title: 'Rollback', courseIds: courses, revision: 1 },
            item.id,
          )
        ).status,
      ).toBe(500);
    } finally {
      spy.mockRestore();
    }
    const current = await agents.student.get(`/api/v1/material-drafts/${item.id}`).expect(200);
    expect(current.body.item).toMatchObject({ title: 'Bản nháp minh họa', revision: 1 });
    expect(current.body.item.courses).toHaveLength(1);
  });
  it('prevents leaving DRAFT without a file at the database boundary', async () => {
    const item = await create('student');
    for (const state of ['SUBMITTED', 'CHANGES_REQUIRED', 'APPROVED', 'REJECTED']) {
      await expect(
        db.query('UPDATE hucescholar.document_versions SET review_status=$2 WHERE document_id=$1', [
          item.id,
          state,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    }
  });
  it('searches and paginates only owned drafts', async () => {
    const item = await create('student');
    await write('student', { ...body(), title: prefix, revision: 1 }, item.id);
    const list = await agents.student
      .get(`/api/v1/material-drafts?search=${prefix}&limit=1&page=1`)
      .expect(200);
    expect(list.body).toMatchObject({ total: 1, page: 1, limit: 1 });
    expect(list.body.items[0].id).toBe(item.id);
  });
  it('retains metadata after revocation but blocks edits even by dropping old courses', async () => {
    const item = await create();
    const assignment = (
      await db.query(
        'SELECT id FROM hucescholar.lecturer_assignments WHERE lecturer_id=$1 AND revoked_at IS NULL',
        [users.lecturer],
      )
    ).rows[0].id;
    const csrf = (await agents.admin.get('/api/v1/auth/csrf')).body.csrfToken;
    const [edit, revoke] = await Promise.all([
      write('lecturer', { ...body(), title: 'Concurrent edit', revision: 1 }, item.id),
      agents.admin
        .patch(`/api/v1/admin/assignments/${assignment}/revoke`)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send({ reason: 'Test revocation' }),
    ]);
    expect(revoke.status).toBe(200);
    expect([200, 409]).toContain(edit.status);
    const current = await agents.lecturer.get(`/api/v1/material-drafts/${item.id}`).expect(200);
    expect(current.body.item.editable).toBe(false);
    expect(
      (
        await write(
          'lecturer',
          { ...body(), courseIds: [courses[1]], revision: current.body.item.revision },
          item.id,
        )
      ).status,
    ).toBe(409);
    expect((await agents.lecturer.get('/api/v1/material-drafts/courses')).body.total).toBe(0);
  });
});
