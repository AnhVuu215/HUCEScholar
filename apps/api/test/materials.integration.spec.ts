import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
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
import { get as httpGet } from 'node:http';
import type { Readable } from 'node:stream';
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
      ['receiver', 'LECTURER'],
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
    for (const course of courses)
      await db.query(
        'INSERT INTO hucescholar.lecturer_assignments(lecturer_id,course_id,assigned_by) VALUES($1,$2,$3)',
        [users.receiver, course, users.admin],
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
      // Isolated test DB only: terminal snapshots are immutable even during cleanup.
      // Transaction-scoped DDL locks block other clients until both guards are restored.
      await db.query('BEGIN');
      try {
        await db.query(
          'ALTER TABLE hucescholar.document_versions DISABLE TRIGGER tr_protect_version',
        );
        await db.query(
          'ALTER TABLE hucescholar.version_courses DISABLE TRIGGER tr_protect_version_courses',
        );
        await db.query(
          'UPDATE hucescholar.documents SET current_version_id=null WHERE created_by=ANY($1::bigint[])',
          [ids],
        );
        await db.query(
          'DELETE FROM hucescholar.ownership_transfers WHERE performed_by=ANY($1::bigint[])',
          [ids],
        );
        await db.query(
          'DELETE FROM hucescholar.visibility_events WHERE performed_by=ANY($1::bigint[])',
          [ids],
        );
        await db.query(
          'DELETE FROM hucescholar.publication_requests WHERE submitted_by=ANY($1::bigint[])',
          [ids],
        );
        await db.query(
          "UPDATE hucescholar.document_versions SET review_status='DRAFT' WHERE created_by=ANY($1::bigint[]) AND review_status='SUBMITTED'",
          [ids],
        );
        await db.query(
          'DELETE FROM hucescholar.version_courses WHERE version_id IN (SELECT id FROM hucescholar.document_versions WHERE created_by=ANY($1::bigint[]))',
          [ids],
        );
        await db.query('DELETE FROM hucescholar.annotations WHERE user_id=ANY($1::bigint[])', [
          ids,
        ]);
        await db.query('DELETE FROM hucescholar.reading_progress WHERE user_id=ANY($1::bigint[])', [
          ids,
        ]);
        await db.query('DELETE FROM hucescholar.saved_documents WHERE user_id=ANY($1::bigint[])', [
          ids,
        ]);
        await db.query(
          'DELETE FROM hucescholar.document_versions WHERE created_by=ANY($1::bigint[])',
          [ids],
        );
        await db.query('DELETE FROM hucescholar.documents WHERE created_by=ANY($1::bigint[])', [
          ids,
        ]);
        await db.query(
          'ALTER TABLE hucescholar.document_versions ENABLE TRIGGER tr_protect_version',
        );
        await db.query(
          'ALTER TABLE hucescholar.version_courses ENABLE TRIGGER tr_protect_version_courses',
        );
        await db.query('COMMIT');
      } catch (failure) {
        await db.query('ROLLBACK');
        throw failure;
      }
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
  async function publication(name: string, id: string, action: string, data: object) {
    const agent = agents[name];
    const csrf = (await agent.get('/api/v1/auth/csrf')).body.csrfToken;
    return agent
      .post(`/api/v1/material-drafts/${id}/${action}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send(data);
  }
  async function safeDraft(name = 'student', pageCount = 1) {
    const item = await create(name);
    const result = await upload(name, item.id, item.revision);
    expect(result.status).toBe(201);
    // Synthetic scanner fixture only; real ClamAV is covered by its opt-in suite.
    await db.query(
      "UPDATE hucescholar.files SET scan_status='SAFE',checked_at=now(),page_count=$2,has_text_layer=true WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE document_id=$1)",
      [item.id, pageCount],
    );
    return result.body.item;
  }
  it.each(['student', 'lecturer'])(
    '%s submits a frozen snapshot, withdraws with history and submits again',
    async (name) => {
      const item = await safeDraft(name);
      const result = await publication(name, item.id, 'submit', { revision: 2 });
      expect(result.status).toBe(201);
      expect(result.body.item).toMatchObject({
        reviewStatus: 'SUBMITTED',
        revision: 3,
        editable: false,
      });
      const pending = (
        await db.query('SELECT * FROM hucescholar.publication_requests WHERE version_id=$1', [
          item.versionId,
        ])
      ).rows[0];
      expect(pending).toMatchObject({
        status: 'PENDING',
        submitted_by: users[name],
        submitted_revision: 3,
      });
      expect(
        (await agents[name].get('/api/v1/material-drafts?reviewStatus=SUBMITTED')).body.items.map(
          (v: { id: string }) => v.id,
        ),
      ).toContain(item.id);
      expect((await write(name, { ...body(), revision: 3 }, item.id)).status).toBe(409);
      expect((await upload(name, item.id, 3)).status).toBe(409);
      const withdrawn = await publication(name, item.id, 'withdraw', {
        revision: 3,
        reason: '  Cần bổ sung nguồn  ',
      });
      expect(withdrawn.status).toBe(201);
      expect(withdrawn.body.item).toMatchObject({
        reviewStatus: 'DRAFT',
        revision: 4,
        editable: true,
      });
      expect((await publication(name, item.id, 'submit', { revision: 4 })).status).toBe(201);
      const history = await agents[name]
        .get(`/api/v1/material-drafts/${item.id}/requests?limit=1&page=2`)
        .expect(200);
      expect(history.body).toMatchObject({ total: 2, page: 2, limit: 1 });
      expect(history.body.items[0]).toMatchObject({
        status: 'WITHDRAWN',
        reason: 'Cần bổ sung nguồn',
        submittedRevision: 3,
      });
      expect(JSON.stringify(history.body)).not.toMatch(/object_key|sha256|password/);
      expect(
        (
          await db.query('SELECT current_version_id FROM hucescholar.documents WHERE id=$1', [
            item.id,
          ])
        ).rows[0].current_version_id,
      ).toBeNull();
      expect(
        (
          await db.query(
            "SELECT event_type FROM hucescholar.audit_events WHERE entity_id=$1 AND event_type IN ('MATERIAL_SUBMITTED','MATERIAL_WITHDRAWN')",
            [item.id],
          )
        ).rows,
      ).toHaveLength(3);
    },
  );
  it('rejects missing, checking and failed PDFs without creating requests', async () => {
    const item = await create('student');
    expect((await publication('student', item.id, 'submit', { revision: 1 })).body.code).toBe(
      'FILE_NOT_SAFE',
    );
    await upload('student', item.id, 1);
    expect((await publication('student', item.id, 'submit', { revision: 2 })).body.code).toBe(
      'FILE_NOT_SAFE',
    );
    await db.query(
      "UPDATE hucescholar.files SET scan_status='FAILED',checked_at=now() WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE document_id=$1)",
      [item.id],
    );
    expect((await publication('student', item.id, 'submit', { revision: 2 })).body.code).toBe(
      'FILE_NOT_SAFE',
    );
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM hucescholar.publication_requests WHERE version_id=$1',
          [item.versionId],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it('enforces owner, role, CSRF and transition input validation', async () => {
    const item = await safeDraft();
    for (const action of ['submit', 'withdraw']) {
      const data = { revision: 2, ...(action === 'withdraw' ? { reason: 'Kiểm thử' } : {}) };
      expect((await publication('other', item.id, action, data)).status).toBe(404);
      expect((await publication('admin', item.id, action, data)).status).toBe(403);
      await agents.student
        .post(`/api/v1/material-drafts/${item.id}/${action}`)
        .set('Origin', origin)
        .send(data)
        .expect(403);
    }
    await agents.other.get(`/api/v1/material-drafts/${item.id}/requests`).expect(404);
    for (const data of [
      {},
      { revision: 0 },
      { revision: '2' },
      { revision: 2, status: 'APPROVED' },
    ])
      expect((await publication('student', item.id, 'submit', data)).status).toBe(400);
    expect(
      (await publication('student', item.id, 'withdraw', { revision: 2, reason: ' ' })).status,
    ).toBe(400);
    await agents.student.get('/api/v1/material-drafts?reviewStatus=BOGUS').expect(400);
  });
  it('serializes competing requests and rejects stale withdrawals after resubmission', async () => {
    const item = await safeDraft();
    const sends = await Promise.all(
      [1, 2].map(() => publication('student', item.id, 'submit', { revision: 2 })),
    );
    expect(sends.map((r) => r.status).sort()).toEqual([201, 409]);
    const pulls = await Promise.all(
      [1, 2].map(() =>
        publication('student', item.id, 'withdraw', { revision: 3, reason: 'Sửa lại' }),
      ),
    );
    expect(pulls.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await publication('student', item.id, 'submit', { revision: 4 })).status).toBe(201);
    expect(
      (await publication('student', item.id, 'withdraw', { revision: 3, reason: 'Yêu cầu cũ' }))
        .body.code,
    ).toBe('STALE_REVISION');
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM hucescholar.publication_requests WHERE version_id=$1 AND status='PENDING'",
          [item.versionId],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('rolls back status, request, revision and audit together on either transition failure', async () => {
    const item = await safeDraft();
    for (const [action, revision] of [
      ['submit', 2],
      ['withdraw', 3],
    ] as const) {
      const spy = jest
        .spyOn(app.get(MaterialsService), 'audit')
        .mockRejectedValueOnce(new Error('Synthetic audit failure'));
      try {
        expect(
          (
            await publication('student', item.id, action, {
              revision,
              ...(action === 'withdraw' ? { reason: 'Sửa lại' } : {}),
            })
          ).status,
        ).toBe(500);
      } finally {
        spy.mockRestore();
      }
      const current = (await agents.student.get(`/api/v1/material-drafts/${item.id}`)).body.item;
      expect(current.revision).toBe(revision);
      expect(current.reviewStatus).toBe(action === 'submit' ? 'DRAFT' : 'SUBMITTED');
      expect(
        (
          await db.query(
            "SELECT count(*)::int n FROM hucescholar.publication_requests WHERE version_id=$1 AND status='PENDING'",
            [item.versionId],
          )
        ).rows[0].n,
      ).toBe(action === 'submit' ? 0 : 1);
      if (action === 'submit')
        expect((await publication('student', item.id, 'submit', { revision })).status).toBe(201);
    }
  });
  it('rechecks metadata, rights expiry and active courses at submission', async () => {
    const item = await safeDraft();
    await db.query("UPDATE hucescholar.document_versions SET source_reference='' WHERE id=$1", [
      item.versionId,
    ]);
    expect((await publication('student', item.id, 'submit', { revision: 2 })).body.code).toBe(
      'METADATA_REQUIRED',
    );
    await db.query(
      "UPDATE hucescholar.document_versions SET source_reference='Synthetic source',rights_valid_until=now()-interval '1 day' WHERE id=$1",
      [item.versionId],
    );
    expect((await publication('student', item.id, 'submit', { revision: 2 })).body.code).toBe(
      'RIGHTS_EXPIRED',
    );
    await db.query('UPDATE hucescholar.document_versions SET rights_valid_until=null WHERE id=$1', [
      item.versionId,
    ]);
    await db.query('UPDATE hucescholar.courses SET is_active=false WHERE id=$1', [courses[0]]);
    try {
      expect((await publication('student', item.id, 'submit', { revision: 2 })).body.code).toBe(
        'COURSE_UNAVAILABLE',
      );
    } finally {
      await db.query('UPDATE hucescholar.courses SET is_active=true WHERE id=$1', [courses[0]]);
    }
  });
  async function review(id: string, data: object, name = 'admin') {
    const csrf = (await agents[name].get('/api/v1/auth/csrf')).body.csrfToken;
    return agents[name]
      .post(`/api/v1/admin/publication-requests/${id}/decision`)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send(data);
  }
  async function submitted(name = 'student', pageCount = 1) {
    const draft = await safeDraft(name, pageCount);
    expect((await publication(name, draft.id, 'submit', { revision: 2 })).status).toBe(201);
    const pending = (
      await db.query(
        "SELECT id FROM hucescholar.publication_requests WHERE version_id=$1 AND status='PENDING'",
        [draft.versionId],
      )
    ).rows[0];
    return { ...draft, requestId: pending.id };
  }
  const decision = (outcome = 'APPROVED') => ({
    revision: 1,
    submittedRevision: 3,
    outcome,
    rightsConfirmed: true,
    reason: 'Đã kiểm tra nguồn và nội dung minh họa',
  });
  it('library lists only readable current versions and filters without leaking private metadata', async () => {
    const item = await submitted();
    expect((await review(item.requestId, decision())).status).toBe(201);
    const hidden = await submitted();
    expect((await review(hidden.requestId, decision())).status).toBe(201);
    await db.query("UPDATE hucescholar.documents SET visibility='HIDDEN' WHERE id=$1", [hidden.id]);
    const draft = await safeDraft();
    const choices = await agents.student.get('/api/v1/library/courses').expect(200);
    expect(choices.body.items.some((c: { id: string }) => c.id === courses[0])).toBe(true);
    for (const role of ['admin', 'student', 'lecturer']) {
      const list = await agents[role]
        .get(
          `/api/v1/library?courseId=${courses[0]}&kind=STUDENT_SUPPLEMENT&materialType=EXERCISE&search=minh&limit=100`,
        )
        .expect(200);
      expect(
        list.body.items.some((v: { versionId: string }) => v.versionId === item.versionId),
      ).toBe(true);
      expect(
        list.body.items.some((v: { versionId: string }) =>
          [hidden.versionId, draft.versionId].includes(v.versionId),
        ),
      ).toBe(false);
      expect(JSON.stringify(list.body)).not.toMatch(
        /object_key|quarantine\/|sha256|rightsConfirmed/,
      );
      await agents[role].get(`/api/v1/library/versions/${hidden.versionId}`).expect(404);
      await agents[role].get(`/api/v1/library/versions/${draft.versionId}/pdf`).expect(404);
    }
    await request(app.getHttpServer()).get('/api/v1/library').expect(401);
    for (const query of [
      'page=0',
      'courseId=oops',
      'kind=ADMIN',
      'materialType=BAD',
      'visibility=HIDDEN',
    ])
      await agents.student.get(`/api/v1/library?${query}`).expect(400);
    const page = await agents.student.get('/api/v1/library?limit=1').expect(200);
    expect(page.body.items).toHaveLength(1);
    await agents.student.get('/api/v1/library/versions/9223372036854775808').expect(400);
  });
  it('library streams exact private byte ranges and separately enforces download permission', async () => {
    const item = await submitted();
    expect((await review(item.requestId, decision())).status).toBe(201);
    const path = `/api/v1/library/versions/${item.versionId}`;
    const full = await agents.student.get(`${path}/pdf`).expect(200);
    expect(full.headers['cache-control']).toContain('no-store');
    expect(full.headers['accept-ranges']).toBe('bytes');
    const size = Number(full.headers['content-length']);
    const part = await agents.student.get(`${path}/pdf`).set('Range', 'bytes=0-4').expect(206);
    expect(part.body.toString()).toBe('%PDF-');
    expect(part.headers['content-range']).toBe(`bytes 0-4/${size}`);
    expect(part.headers['content-length']).toBe('5');
    const suffix = await agents.student.get(`${path}/pdf`).set('Range', 'bytes=-4').expect(206);
    expect(suffix.body.equals(full.body.subarray(size - 4))).toBe(true);
    const open = await agents.student.get(`${path}/pdf`).set('Range', 'bytes=5-').expect(206);
    expect(open.body.equals(full.body.subarray(5))).toBe(true);
    for (const range of [
      `bytes=${size}-`,
      'bytes=4-2',
      'bytes=0-1,3-4',
      'bytes=-0',
      'items=0-1',
      'bytes=99999999999999999999999-',
    ]) {
      const result = await agents.student.get(`${path}/pdf`).set('Range', range).expect(416);
      expect(result.headers['content-range']).toBe(`bytes */${size}`);
    }
    await agents.admin.get(`${path}/download`).expect(403);
    await agents.student.get(`${path}/download`).expect(403);
    const allowed = await create('student');
    const updated = await write(
      'student',
      { ...body(), downloadAllowed: true, revision: 1 },
      allowed.id,
    );
    await upload('student', allowed.id, updated.body.item.revision);
    await db.query(
      "UPDATE hucescholar.files SET scan_status='SAFE',checked_at=now(),page_count=1,has_text_layer=true WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE document_id=$1)",
      [allowed.id],
    );
    await publication('student', allowed.id, 'submit', { revision: 3 });
    const pending = (
      await db.query(
        "SELECT id FROM hucescholar.publication_requests WHERE version_id=$1 AND status='PENDING'",
        [allowed.versionId],
      )
    ).rows[0];
    expect((await review(pending.id, { ...decision(), submittedRevision: 4 })).status).toBe(201);
    const download = await agents.lecturer
      .get(`/api/v1/library/versions/${allowed.versionId}/download`)
      .expect(200);
    expect(download.headers['content-disposition']).toContain('attachment;');
  });
  it('library rechecks hidden, unsafe and expired versions for each new request, including admins', async () => {
    const item = await submitted();
    expect((await review(item.requestId, decision())).status).toBe(201);
    const path = `/api/v1/library/versions/${item.versionId}`;
    await agents.student.get(path).expect(200);
    await db.query("UPDATE hucescholar.documents SET visibility='HIDDEN' WHERE id=$1", [item.id]);
    for (const endpoint of [path, `${path}/pdf`, `${path}/download`])
      await agents.admin.get(endpoint).expect(404);
    await db.query("UPDATE hucescholar.documents SET visibility='VISIBLE' WHERE id=$1", [item.id]);
    await db.query(
      "UPDATE hucescholar.files SET scan_status='FAILED' WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE id=$1)",
      [item.versionId],
    );
    await agents.student.get(`${path}/pdf`).expect(404);
    const expired = await safeDraft();
    await db.query(
      "UPDATE hucescholar.document_versions SET rights_valid_until=now()-interval '1 day' WHERE id=$1",
      [expired.versionId],
    );
    // Test-only fixture transitions directly to APPROVED: no immutable payload is edited.
    await db.query(
      "UPDATE hucescholar.document_versions SET review_status='APPROVED' WHERE id=$1",
      [expired.versionId],
    );
    await db.query('UPDATE hucescholar.documents SET current_version_id=$1 WHERE id=$2', [
      expired.versionId,
      expired.id,
    ]);
    await agents.admin.get(`/api/v1/library/versions/${expired.versionId}/pdf`).expect(404);
  });
  it('library pins approved old versions while listing only the current version and reports unavailable storage', async () => {
    const item = await submitted();
    expect((await review(item.requestId, decision())).status).toBe(201);
    const newer = (
      await db.query(
        "INSERT INTO hucescholar.document_versions(document_id,version_no,file_id,created_by,title,authors,material_type,source_reference,rights_basis,review_status) SELECT document_id,2,file_id,created_by,title,authors,material_type,source_reference,rights_basis,'APPROVED' FROM hucescholar.document_versions WHERE id=$1 RETURNING id",
        [item.versionId],
      )
    ).rows[0].id;
    await db.query('UPDATE hucescholar.documents SET current_version_id=$1 WHERE id=$2', [
      newer,
      item.id,
    ]);
    const list = await agents.student.get('/api/v1/library?limit=100').expect(200);
    expect(list.body.items.some((v: { versionId: string }) => v.versionId === newer)).toBe(true);
    expect(list.body.items.some((v: { versionId: string }) => v.versionId === item.versionId)).toBe(
      false,
    );
    const old = await agents.student.get(`/api/v1/library/versions/${item.versionId}`).expect(200);
    expect(old.body.item.current).toBe(false);
    await db.query('UPDATE hucescholar.courses SET is_active=false WHERE id=$1', [courses[0]]);
    await agents.student.get(`/api/v1/library/versions/${item.versionId}/pdf`).expect(200);
    await db.query('UPDATE hucescholar.courses SET is_active=true WHERE id=$1', [courses[0]]);
    const file = await uploadedFile(item);
    await app.get(PrivateStore).remove(file.object_key);
    await agents.student.get(`/api/v1/library/versions/${item.versionId}/pdf`).expect(503);
  });
  it('closes the private source stream when the reader cancels its HTTP response', async () => {
    const item = await create('student');
    await upload(
      'student',
      item.id,
      1,
      Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(8 * 1024 * 1024, 32)]),
    );
    await db.query(
      "UPDATE hucescholar.files SET scan_status='SAFE',checked_at=now(),page_count=1,has_text_layer=true WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE id=$1)",
      [item.versionId],
    );
    await publication('student', item.id, 'submit', { revision: 2 });
    const pending = (
      await db.query(
        "SELECT id FROM hucescholar.publication_requests WHERE version_id=$1 AND status='PENDING'",
        [item.versionId],
      )
    ).rows[0];
    expect((await review(pending.id, decision())).status).toBe(201);
    const csrf = (await agents.student.get('/api/v1/auth/csrf')).body.csrfToken;
    const login = await agents.student
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({ email: `${prefix}-student@example.test`, password })
      .expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])
      .map((s) => s.split(';')[0])
      .join(';');
    const store = app.get(PrivateStore),
      original = store.read.bind(store);
    let source: Readable | undefined;
    const observed = jest.spyOn(store, 'read').mockImplementation(async (...args) => {
      source = await original(...args);
      return source;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const address = app.getHttpServer().address();
      await new Promise<void>((resolve, reject) => {
        const req = httpGet(
          `http://127.0.0.1:${address.port}/api/v1/library/versions/${item.versionId}/pdf`,
          { headers: { Cookie: cookie } },
          (res) => {
            res.once('data', () => {
              res.destroy();
              resolve();
            });
            res.on('error', () => {});
          },
        );
        req.on('error', reject);
      });
      expect(source).toBeDefined();
      const closed = await new Promise<boolean>((resolve) => {
        if (source!.destroyed) return resolve(true);
        source!.once('close', () => resolve(true));
        timer = setTimeout(() => resolve(false), 1000);
      });
      expect(closed).toBe(true);
    } finally {
      clearTimeout(timer);
      source?.destroy();
      observed.mockRestore();
    }
  });
  async function readingFixture() {
    const item = await submitted('student', 3);
    expect((await review(item.requestId, decision())).status).toBe(201);
    return { ...item, path: `/api/v1/library/versions/${item.versionId}` };
  }
  async function savedWrite(
    name: string,
    id: string,
    method: 'put' | 'delete' = 'put',
    body: object = { saved: true },
  ) {
    const csrf = (await agents[name].get('/api/v1/auth/csrf')).body.csrfToken;
    return agents[name][method](`/api/v1/personal-library/saved/${id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send(body);
  }
  it.each(['student', 'lecturer', 'admin'])(
    'personal library is private and save/remove is idempotent for %s',
    async (role) => {
      const item = await readingFixture();
      const path = `/api/v1/personal-library/saved/${item.id}`;
      expect((await agents[role].get(path)).body.saved).toBe(false);
      const saved = await Promise.all([savedWrite(role, item.id), savedWrite(role, item.id)]);
      expect(saved.map((r) => r.status)).toEqual([200, 200]);
      expect((await agents[role].get(path)).body.saved).toBe(true);
      const mine = await agents[role].get('/api/v1/personal-library/saved').expect(200);
      expect(mine.body.limit).toBe(12);
      expect(
        mine.body.items.find((r: { documentId: string }) => r.documentId === item.id).material
          .versionId,
      ).toBe(item.versionId);
      expect(JSON.stringify(mine.body)).not.toMatch(/object_key|request_id|password|sha256/);
      expect((await agents.other.get(path)).body.saved).toBe(false);
      expect((await agents.other.get('/api/v1/personal-library/saved')).body.items).toEqual([]);
      expect((await savedWrite('other', item.id, 'delete')).status).toBe(200);
      expect((await agents[role].get(path)).body.saved).toBe(true);
      expect((await savedWrite(role, item.id, 'delete')).body.saved).toBe(false);
      expect((await savedWrite(role, item.id, 'delete')).status).toBe(200);
    },
  );
  it('personal library retains unavailable entries without metadata and allows removing hidden saves', async () => {
    const item = await readingFixture();
    expect((await savedWrite('student', item.id)).status).toBe(200);
    expect(
      (
        await readingWrite(
          'student',
          `${item.path}/progress`,
          { pageNumber: 2, revision: 0 },
          'put',
        )
      ).status,
    ).toBe(200);
    await db.query("UPDATE hucescholar.documents SET visibility='HIDDEN' WHERE id=$1", [item.id]);
    for (const list of ['saved', 'recent']) {
      const result = await agents.student.get(`/api/v1/personal-library/${list}`).expect(200);
      const entry = result.body.items.find((r: { documentId: string }) => r.documentId === item.id);
      expect(entry.material).toBeNull();
      expect(JSON.stringify(entry)).not.toContain(item.title);
    }
    expect((await savedWrite('student', item.id)).status).toBe(404);
    expect((await savedWrite('student', item.id, 'delete')).status).toBe(200);
    expect(
      (
        await db.query(
          'SELECT count(*) FROM hucescholar.reading_progress WHERE user_id=$1 AND version_id=$2',
          [users.student, item.versionId],
        )
      ).rows[0].count,
    ).toBe('1');
    await db.query("UPDATE hucescholar.documents SET visibility='VISIBLE' WHERE id=$1", [item.id]);
    await db.query(
      "UPDATE hucescholar.files SET scan_status='FAILED' WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE id=$1)",
      [item.versionId],
    );
    expect((await savedWrite('student', item.id)).status).toBe(404);
    expect(
      (await agents.student.get('/api/v1/personal-library/recent')).body.items.find(
        (r: { versionId: string }) => r.versionId === item.versionId,
      ).material,
    ).toBeNull();
    await db.query(
      "UPDATE hucescholar.files SET scan_status='SAFE' WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE id=$1)",
      [item.versionId],
    );
    const expired = await safeDraft('student');
    await db.query(
      "UPDATE hucescholar.document_versions SET rights_valid_until=now()-interval '1 day',review_status='APPROVED' WHERE id=$1",
      [expired.versionId],
    );
    await db.query('UPDATE hucescholar.documents SET current_version_id=$2 WHERE id=$1', [
      expired.id,
      expired.versionId,
    ]);
    await db.query('INSERT INTO hucescholar.saved_documents(user_id,document_id) VALUES($1,$2)', [
      users.student,
      expired.id,
    ]);
    await db.query(
      'INSERT INTO hucescholar.reading_progress(user_id,version_id,page_number) VALUES($1,$2,1)',
      [users.student, expired.versionId],
    );
    expect((await savedWrite('student', expired.id)).status).toBe(404);
    for (const list of ['saved', 'recent']) {
      const result = await agents.student.get(`/api/v1/personal-library/${list}`).expect(200);
      expect(
        result.body.items.find((r: { documentId: string }) => r.documentId === expired.id).material,
      ).toBeNull();
    }
    expect((await savedWrite('student', expired.id, 'delete')).status).toBe(200);
  });
  it('personal saved entries follow current while recent remains pinned to the old approved version', async () => {
    const item = await readingFixture();
    await savedWrite('student', item.id);
    await readingWrite('student', `${item.path}/progress`, { pageNumber: 2, revision: 0 }, 'put');
    const next = (
      await db.query(
        "INSERT INTO hucescholar.document_versions(document_id,version_no,file_id,created_by,title,authors,material_type,source_reference,rights_basis,review_status) SELECT document_id,2,file_id,created_by,'New published snapshot',authors,material_type,source_reference,rights_basis,'APPROVED' FROM hucescholar.document_versions WHERE id=$1 RETURNING id",
        [item.versionId],
      )
    ).rows[0];
    await db.query('UPDATE hucescholar.documents SET current_version_id=$2 WHERE id=$1', [
      item.id,
      next.id,
    ]);
    const saved = (await agents.student.get('/api/v1/personal-library/saved')).body.items.find(
      (r: { documentId: string }) => r.documentId === item.id,
    );
    const recent = (await agents.student.get('/api/v1/personal-library/recent')).body.items.find(
      (r: { versionId: string }) => r.versionId === item.versionId,
    );
    expect(saved.material.versionId).toBe(next.id);
    expect(recent.material).toMatchObject({ versionId: item.versionId, current: false });
    expect(recent.pageNumber).toBe(2);
    expect((await agents.other.get('/api/v1/personal-library/recent')).body.items).toEqual([]);
  });
  it('personal library validates input, pagination and CSRF and refuses unpublished saves', async () => {
    const unpublished = await create('student');
    expect((await savedWrite('student', unpublished.id)).status).toBe(404);
    expect((await savedWrite('student', '9223372036854775808')).status).toBe(400);
    const item = await readingFixture();
    await agents.student
      .put(`/api/v1/personal-library/saved/${item.id}`)
      .send({ saved: true })
      .expect(403);
    expect(
      (await savedWrite('student', item.id, 'put', { saved: true, userId: users.other })).status,
    ).toBe(400);
    expect((await savedWrite('student', item.id, 'put', { saved: false })).status).toBe(400);
    await agents.student.get('/api/v1/personal-library/saved?userId=1').expect(400);
    await agents.student.get('/api/v1/personal-library/recent?limit=101').expect(400);
    await savedWrite('student', item.id);
    const second = await readingFixture();
    await savedWrite('student', second.id);
    const pages = await Promise.all(
      [1, 2].map((page) =>
        agents.student.get(`/api/v1/personal-library/saved?limit=1&page=${page}`),
      ),
    );
    expect(pages.map((r) => r.status)).toEqual([200, 200]);
    expect(pages[0].body.items).toHaveLength(1);
    expect(pages[0].body.items[0].documentId).not.toBe(pages[1].body.items[0].documentId);
    expect(pages[0].headers['cache-control']).toBe('no-store');
  });
  async function lifecycleWrite(id: string, action: string, data: object, name = 'admin') {
    const csrf = (await agents[name].get('/api/v1/auth/csrf')).body.csrfToken;
    return agents[name]
      .post(`/api/v1/admin/materials/${id}/${action}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send(data);
  }
  const documentRevision = async (id: string) =>
    (await db.query('SELECT revision FROM hucescholar.documents WHERE id=$1', [id])).rows[0]
      .revision;
  it('lifecycle admin lists all materials and transfers a pending lecturer document atomically', async () => {
    const item = await submitted('lecturer');
    const detail = await agents.admin.get(`/api/v1/admin/materials/${item.id}`).expect(200);
    expect(detail.body.item).toMatchObject({
      id: item.id,
      manager: { id: users.lecturer },
      latest: { reviewStatus: 'SUBMITTED' },
    });
    const options = await agents.admin
      .get(`/api/v1/admin/materials/${item.id}/recipients`)
      .expect(200);
    expect(options.body.items.map((r: { id: string }) => r.id)).toContain(users.receiver);
    expect(options.body.items.map((r: { id: string }) => r.id)).not.toContain(users.lecturer);
    const result = await lifecycleWrite(item.id, 'transfer', {
      revision: detail.body.item.revision,
      recipientId: users.receiver,
      reason: 'Bàn giao tổng hợp',
    });
    expect(result.status).toBe(201);
    expect(result.body.item.manager.id).toBe(users.receiver);
    expect(result.body.item.latest.reviewStatus).toBe('DRAFT');
    const requestRow = (
      await db.query('SELECT * FROM hucescholar.publication_requests WHERE id=$1', [item.requestId])
    ).rows[0];
    expect(requestRow).toMatchObject({
      status: 'WITHDRAWN',
      submitted_by: users.lecturer,
      resolved_by: users.admin,
      reason: 'Bàn giao tổng hợp',
    });
    await agents.lecturer.get(`/api/v1/material-drafts/${item.id}`).expect(404);
    expect(
      (await agents.receiver.get(`/api/v1/material-drafts/${item.id}`).expect(200)).body.item
        .editable,
    ).toBe(true);
    const history = await agents.admin.get(`/api/v1/admin/materials/${item.id}`).expect(200);
    expect(history.body.item.history.transfers[0]).toMatchObject({
      fromUserId: users.lecturer,
      toUserId: users.receiver,
      reason: 'Bàn giao tổng hợp',
    });
    const list = await agents.admin
      .get(
        `/api/v1/admin/materials?search=${encodeURIComponent(item.title)}&kind=LECTURER_MATERIAL`,
      )
      .expect(200);
    expect(list.body.items.some((r: { id: string }) => r.id === item.id)).toBe(true);
  });
  it('lifecycle transfer validates role, all historic courses, revision and CSRF without changing a student document', async () => {
    const student = await submitted();
    expect(
      (
        await lifecycleWrite(student.id, 'transfer', {
          revision: await documentRevision(student.id),
          recipientId: users.receiver,
          reason: 'Wrong kind',
        })
      ).status,
    ).toBe(409);
    const item = await submitted('lecturer');
    const revision = await documentRevision(item.id);
    const body = { revision, recipientId: users.receiver, reason: 'Transfer' };
    await agents.student.get('/api/v1/admin/materials').expect(403);
    await agents.lecturer.get(`/api/v1/admin/materials/${item.id}`).expect(403);
    await agents.admin.post(`/api/v1/admin/materials/${item.id}/transfer`).send(body).expect(403);
    expect((await lifecycleWrite(item.id, 'transfer', { ...body, reason: '  ' })).status).toBe(400);
    expect(
      (await lifecycleWrite(item.id, 'transfer', { ...body, managerId: users.student })).status,
    ).toBe(400);
    expect(
      (await lifecycleWrite(item.id, 'transfer', { ...body, recipientId: users.student })).status,
    ).toBe(409);
    expect(
      (await lifecycleWrite(item.id, 'transfer', { ...body, recipientId: users.lecturer })).status,
    ).toBe(409);
    // Receiver lacks historic course 0; the new draft only uses course 1.
    const rejected = await submitted('lecturer');
    expect((await review(rejected.requestId, decision('REJECTED'))).status).toBe(201);
    await db.query(
      "INSERT INTO hucescholar.document_versions(document_id,version_no,created_by,title,material_type,source_reference,rights_basis) VALUES($1,2,$2,'Historic course fixture','TEXTBOOK','Source','Rights')",
      [rejected.id, users.lecturer],
    );
    // The terminal course links are immutable; add the extra course to the new draft.
    const second = (
      await db.query(
        'SELECT id FROM hucescholar.document_versions WHERE document_id=$1 AND version_no=2',
        [rejected.id],
      )
    ).rows[0].id;
    await db.query('INSERT INTO hucescholar.version_courses(version_id,course_id) VALUES($1,$2)', [
      second,
      courses[1],
    ]);
    await db.query(
      'UPDATE hucescholar.lecturer_assignments SET revoked_at=now(),revoked_by=$2 WHERE lecturer_id=$1 AND course_id=$3 AND revoked_at IS NULL',
      [users.receiver, users.admin, courses[0]],
    );
    try {
      expect(
        (await agents.admin.get(`/api/v1/admin/materials/${rejected.id}/recipients`).expect(200))
          .body.items,
      ).toEqual([]);
      expect(
        (
          await lifecycleWrite(rejected.id, 'transfer', {
            ...body,
            revision: await documentRevision(rejected.id),
          })
        ).body.code,
      ).toBe('ASSIGNMENT_REQUIRED');
    } finally {
      await db.query(
        'UPDATE hucescholar.lecturer_assignments SET revoked_at=null,revoked_by=null WHERE lecturer_id=$1 AND course_id=$2',
        [users.receiver, courses[0]],
      );
    }
    const outcomes = await Promise.all([
      lifecycleWrite(item.id, 'transfer', body),
      lifecycleWrite(item.id, 'transfer', body),
    ]);
    expect(outcomes.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it('lifecycle transfer and moderation resolve one pending request and audit failure rolls everything back', async () => {
    const item = await submitted('lecturer');
    const revision = await documentRevision(item.id);
    const outcomes = await Promise.all([
      lifecycleWrite(item.id, 'transfer', {
        revision,
        recipientId: users.receiver,
        reason: 'Concurrent handover',
      }),
      review(item.requestId, decision()),
    ]);
    expect(outcomes.map((r) => r.status).sort()).toEqual([201, 409]);
    const rollback = await submitted('lecturer');
    const spy = jest
      .spyOn(app.get(MaterialsService), 'audit')
      .mockRejectedValueOnce(new Error('Synthetic transfer audit failure'));
    try {
      expect(
        (
          await lifecycleWrite(rollback.id, 'transfer', {
            revision: await documentRevision(rollback.id),
            recipientId: users.receiver,
            reason: 'Rollback',
          })
        ).status,
      ).toBe(500);
      expect(
        (await db.query('SELECT manager_id FROM hucescholar.documents WHERE id=$1', [rollback.id]))
          .rows[0].manager_id,
      ).toBe(users.lecturer);
      expect(
        (
          await db.query('SELECT status FROM hucescholar.publication_requests WHERE id=$1', [
            rollback.requestId,
          ])
        ).rows[0].status,
      ).toBe('PENDING');
      expect(
        (
          await db.query(
            'SELECT count(*) FROM hucescholar.ownership_transfers WHERE document_id=$1',
            [rollback.id],
          )
        ).rows[0].count,
      ).toBe('0');
    } finally {
      spy.mockRestore();
    }
  });
  it('lifecycle hide blocks every read and restore retains notes and progress with event history', async () => {
    const item = await readingFixture();
    await readingWrite('student', `${item.path}/notes`, {
      pageNumber: 1,
      content: 'Retained',
      requestId: randomUUID(),
    });
    await readingWrite('student', `${item.path}/progress`, { pageNumber: 2, revision: 0 }, 'put');
    const hidden = await lifecycleWrite(item.id, 'visibility', {
      revision: await documentRevision(item.id),
      visibility: 'HIDDEN',
      reason: 'Review source',
    });
    expect(hidden.status).toBe(201);
    expect(hidden.body.item.visibility).toBe('HIDDEN');
    for (const suffix of ['', '/pdf', '/download', '/notes?pageNumber=1', '/progress'])
      await agents.student.get(`${item.path}${suffix}`).expect(404);
    expect(
      (
        await db.query('SELECT count(*) FROM hucescholar.annotations WHERE version_id=$1', [
          item.versionId,
        ])
      ).rows[0].count,
    ).toBe('1');
    expect(
      (
        await lifecycleWrite(item.id, 'visibility', {
          revision: hidden.body.item.revision,
          visibility: 'VISIBLE',
          reason: 'Resolved',
        })
      ).status,
    ).toBe(409);
    const restored = await lifecycleWrite(item.id, 'visibility', {
      revision: hidden.body.item.revision,
      visibility: 'VISIBLE',
      reason: 'Resolved',
      resolved: true,
    });
    expect(restored.status).toBe(201);
    expect(
      restored.body.item.history.visibility.map((e: { toVisibility: string }) => e.toVisibility),
    ).toEqual(['VISIBLE', 'HIDDEN']);
    expect(
      (await agents.student.get(`${item.path}/notes?pageNumber=1`)).body.items[0].content,
    ).toBe('Retained');
    expect((await agents.student.get(`${item.path}/progress`)).body.item.pageNumber).toBe(2);
    expect(
      (
        await lifecycleWrite(item.id, 'visibility', {
          revision: hidden.body.item.revision,
          visibility: 'HIDDEN',
          reason: 'Stale',
        })
      ).status,
    ).toBe(409);
  });
  it('lifecycle restore refuses missing current, unsafe files and expired rights, while new approval keeps hidden', async () => {
    const draft = await create('student');
    expect(
      (
        await lifecycleWrite(draft.id, 'visibility', {
          revision: await documentRevision(draft.id),
          visibility: 'HIDDEN',
          reason: 'Hide draft',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await lifecycleWrite(draft.id, 'visibility', {
          revision: await documentRevision(draft.id),
          visibility: 'VISIBLE',
          reason: 'No current',
          resolved: true,
        })
      ).status,
    ).toBe(409);
    const pending = await submitted();
    expect(
      (
        await lifecycleWrite(pending.id, 'visibility', {
          revision: await documentRevision(pending.id),
          visibility: 'HIDDEN',
          reason: 'Hold',
        })
      ).status,
    ).toBe(201);
    expect((await review(pending.requestId, decision())).status).toBe(201);
    expect(
      (await db.query('SELECT visibility FROM hucescholar.documents WHERE id=$1', [pending.id]))
        .rows[0].visibility,
    ).toBe('HIDDEN');
    const file = (
      await db.query('SELECT file_id FROM hucescholar.document_versions WHERE id=$1', [
        pending.versionId,
      ])
    ).rows[0].file_id;
    await db.query("UPDATE hucescholar.files SET scan_status='FAILED' WHERE id=$1", [file]);
    expect(
      (
        await lifecycleWrite(pending.id, 'visibility', {
          revision: await documentRevision(pending.id),
          visibility: 'VISIBLE',
          reason: 'Unsafe',
          resolved: true,
        })
      ).body.code,
    ).toBe('MATERIAL_UNAVAILABLE');
    await db.query("UPDATE hucescholar.files SET scan_status='SAFE' WHERE id=$1", [file]);
    const expired = await safeDraft('student');
    await db.query(
      "UPDATE hucescholar.document_versions SET rights_valid_until=now()-interval '1 day',review_status='APPROVED' WHERE id=$1",
      [expired.versionId],
    );
    await db.query(
      "UPDATE hucescholar.documents SET visibility='HIDDEN',current_version_id=$2 WHERE id=$1",
      [expired.id, expired.versionId],
    );
    expect(
      (
        await lifecycleWrite(expired.id, 'visibility', {
          revision: await documentRevision(expired.id),
          visibility: 'VISIBLE',
          reason: 'Expired',
          resolved: true,
        })
      ).body.code,
    ).toBe('MATERIAL_UNAVAILABLE');
  });
  it('lifecycle creates a fresh next version without changing the published snapshot or private data', async () => {
    const item = await readingFixture();
    const note = await readingWrite('student', `${item.path}/notes`, {
      pageNumber: 1,
      content: 'Ghi chú bản cũ',
      requestId: randomUUID(),
    });
    expect(note.status).toBe(201);
    const before = (
      await db.query('SELECT * FROM hucescholar.document_versions WHERE id=$1', [item.versionId])
    ).rows[0];
    const result = await publication('student', item.id, 'versions', { revision: before.revision });
    expect(result.status).toBe(201);
    expect(result.body.item).toMatchObject({
      id: item.id,
      versionNo: 2,
      reviewStatus: 'DRAFT',
      revision: before.revision + 1,
      fileState: 'MISSING',
      sourceReference: '',
      rightsBasis: '',
      downloadAllowed: false,
    });
    expect(result.body.item.versionId).not.toBe(item.versionId);
    expect(
      (await db.query('SELECT * FROM hucescholar.document_versions WHERE id=$1', [item.versionId]))
        .rows[0],
    ).toEqual(before);
    expect(
      (
        await db.query('SELECT current_version_id FROM hucescholar.documents WHERE id=$1', [
          item.id,
        ])
      ).rows[0].current_version_id,
    ).toBe(item.versionId);
    expect(
      (await agents.student.get(`${item.path}/notes?pageNumber=1`)).body.items[0].content,
    ).toBe('Ghi chú bản cũ');
    const list = await agents.student
      .get(`/api/v1/material-drafts?search=${encodeURIComponent(before.title)}`)
      .expect(200);
    expect(list.body.items.filter((v: { id: string }) => v.id === item.id)).toHaveLength(1);
    expect(list.body.items.find((v: { id: string }) => v.id === item.id).versionNo).toBe(2);
    const versions = await agents.student
      .get(`/api/v1/material-drafts/${item.id}/versions`)
      .expect(200);
    expect(versions.body.items.map((v: { versionNo: number }) => v.versionNo)).toEqual([2, 1]);
    const history = await agents.student
      .get(`/api/v1/material-drafts/${item.id}/requests?versionId=${item.versionId}`)
      .expect(200);
    expect(history.body.items[0].status).toBe('APPROVED');
    await agents.other.get(`/api/v1/material-drafts/${item.id}/versions`).expect(404);
    await agents.admin.get(`/api/v1/material-drafts/${item.id}/versions`).expect(403);
  });
  it('lifecycle rejects old-version metadata, PDF and delayed successor writes', async () => {
    const draft = await create('student');
    const saved = await write('student', { ...body(), revision: draft.revision }, draft.id);
    expect(saved.status).toBe(200);
    expect((await upload('student', draft.id, saved.body.item.revision)).status).toBe(201);
    const scan = async (versionId: string) =>
      db.query(
        "UPDATE hucescholar.files SET scan_status='SAFE',checked_at=now(),page_count=1,has_text_layer=true WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE id=$1)",
        [versionId],
      );
    await scan(draft.versionId);
    expect((await publication('student', draft.id, 'submit', { revision: 3 })).status).toBe(201);
    const request = (await agents.admin.get('/api/v1/admin/publication-requests')).body.items.find(
      (r: { documentId: string }) => r.documentId === draft.id,
    );
    expect(
      (await review(request.id, { ...decision('REJECTED'), submittedRevision: 4 })).status,
    ).toBe(201);
    const next = await publication('student', draft.id, 'versions', { revision: 5 });
    expect(next.status).toBe(201);
    const stale = await Promise.all([
      write('student', { ...body(), title: 'Stale V1 metadata', revision: 1 }, draft.id),
      upload('student', draft.id, 1),
    ]);
    expect(stale.map((r) => r.status)).toEqual([409, 409]);
    const current = (await agents.student.get(`/api/v1/material-drafts/${draft.id}`)).body.item;
    const edited = await write('student', { ...body(), revision: current.revision }, draft.id);
    const attached = await upload('student', draft.id, edited.body.item.revision);
    await scan(current.versionId);
    expect(
      (await publication('student', draft.id, 'submit', { revision: attached.body.item.revision }))
        .status,
    ).toBe(201);
    const pending = (await agents.admin.get('/api/v1/admin/publication-requests')).body.items.find(
      (r: { documentId: string }) => r.documentId === draft.id,
    );
    expect(
      (
        await review(pending.id, {
          ...decision('REJECTED'),
          submittedRevision: attached.body.item.revision + 1,
        })
      ).status,
    ).toBe(201);
    expect((await publication('student', draft.id, 'versions', { revision: 5 })).status).toBe(409);
  });
  it('lifecycle next version accepts terminal rejection but rejects working states, stale retries, invalid fields and CSRF', async () => {
    const pending = await submitted();
    expect((await publication('student', pending.id, 'versions', { revision: 3 })).status).toBe(
      409,
    );
    expect((await review(pending.requestId, decision('REJECTED'))).status).toBe(201);
    expect((await publication('student', pending.id, 'versions', { revision: 3 })).status).toBe(
      409,
    );
    expect((await publication('other', pending.id, 'versions', { revision: 4 })).status).toBe(404);
    await agents.student
      .post(`/api/v1/material-drafts/${pending.id}/versions`)
      .send({ revision: 4 })
      .expect(403);
    expect(
      (
        await publication('student', pending.id, 'versions', {
          revision: 4,
          managerId: users.other,
        })
      ).status,
    ).toBe(400);
    const concurrent = await Promise.all([
      publication('student', pending.id, 'versions', { revision: 4 }),
      publication('student', pending.id, 'versions', { revision: 4 }),
    ]);
    expect(concurrent.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      (
        await db.query('SELECT count(*) FROM hucescholar.document_versions WHERE document_id=$1', [
          pending.id,
        ])
      ).rows[0].count,
    ).toBe('2');
  });
  it('lifecycle next version checks lecturer assignments and rolls back on audit failure', async () => {
    const item = await submitted('lecturer');
    expect((await review(item.requestId, decision())).status).toBe(201);
    await db.query(
      'UPDATE hucescholar.lecturer_assignments SET revoked_at=now(),revoked_by=$2 WHERE lecturer_id=$1 AND revoked_at IS NULL',
      [users.lecturer, users.admin],
    );
    try {
      expect((await publication('lecturer', item.id, 'versions', { revision: 4 })).body.code).toBe(
        'ASSIGNMENT_REQUIRED',
      );
    } finally {
      await db.query(
        'UPDATE hucescholar.lecturer_assignments SET revoked_at=null,revoked_by=null WHERE lecturer_id=$1',
        [users.lecturer],
      );
    }
    const spy = jest
      .spyOn(app.get(MaterialsService), 'audit')
      .mockRejectedValueOnce(new Error('Synthetic lifecycle audit failure'));
    try {
      expect((await publication('lecturer', item.id, 'versions', { revision: 4 })).status).toBe(
        500,
      );
      expect(
        (
          await db.query(
            'SELECT count(*) FROM hucescholar.document_versions WHERE document_id=$1',
            [item.id],
          )
        ).rows[0].count,
      ).toBe('1');
    } finally {
      spy.mockRestore();
    }
  });
  async function readingWrite(
    name: string,
    path: string,
    data: object,
    method: 'post' | 'put' | 'patch' | 'delete' = 'post',
  ) {
    const agent = agents[name];
    const csrf = (await agent.get('/api/v1/auth/csrf')).body.csrfToken;
    return agent[method](path).set('Origin', origin).set('X-CSRF-Token', csrf).send(data);
  }
  it('reading writes waiting for moderation do not exclusively lock the manager account', async () => {
    const item = await submitted('student', 3);
    const blocker = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await blocker.connect();
    let pending: ReturnType<typeof readingWrite> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM hucescholar.documents WHERE id=$1 FOR UPDATE', [item.id]);
      pending = readingWrite(
        'student',
        `/api/v1/library/versions/${item.versionId}/progress`,
        {
          pageNumber: 1,
          revision: 0,
        },
        'put',
      );
      let waiting = false;
      for (let i = 0; i < 30; i++) {
        waiting =
          Number(
            (
              await db.query(
                "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%hucescholar.documents%FOR SHARE%'",
              )
            ).rows[0].count,
          ) > 0;
        if (waiting) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(true);
      // Approval already holds the document and then shares the manager row.
      // This must not wait on an exclusive actor lock held by the reader.
      await blocker.query('SELECT id FROM hucescholar.users WHERE id=$1 FOR SHARE NOWAIT', [
        users.student,
      ]);
    } finally {
      await blocker.query('ROLLBACK');
      await blocker.end();
      if (pending) expect((await pending).status).toBe(404);
    }
  });
  it('reading notes are private to each role and cannot be accessed by another owner or admin', async () => {
    const { path } = await readingFixture();
    const note = await readingWrite('student', `${path}/notes`, {
      pageNumber: 2,
      content: '  Riêng tư <script>plain text</script>  ',
      requestId: randomUUID(),
    });
    expect(note.status).toBe(201);
    expect(note.body.item).toMatchObject({
      pageNumber: 2,
      content: 'Riêng tư <script>plain text</script>',
      revision: 1,
      kind: 'PAGE_NOTE',
    });
    for (const role of ['admin', 'lecturer', 'other']) {
      const list = await agents[role].get(`${path}/notes?pageNumber=2`).expect(200);
      expect(list.body.items).toEqual([]);
      expect(
        (
          await readingWrite(
            role,
            `${path}/notes/${note.body.item.id}`,
            { content: 'stolen', revision: 1 },
            'patch',
          )
        ).status,
      ).toBe(404);
      expect(
        (await readingWrite(role, `${path}/notes/${note.body.item.id}`, { revision: 1 }, 'delete'))
          .status,
      ).toBe(404);
    }
    for (const role of ['admin', 'lecturer']) {
      const own = await readingWrite(role, `${path}/notes`, {
        pageNumber: 1,
        content: `${role} own note`,
        requestId: randomUUID(),
      });
      expect(own.status).toBe(201);
      expect(
        (await agents[role].get(`${path}/notes?pageNumber=1`).expect(200)).body.items.map(
          (n: { content: string }) => n.content,
        ),
      ).toEqual([`${role} own note`]);
    }
    expect(
      (await agents.student.get(`${path}/notes?pageNumber=2`).expect(200)).body.items,
    ).toHaveLength(1);
    await request(app.getHttpServer()).get(`${path}/notes?pageNumber=1`).expect(401);
    await agents.student.post(`${path}/notes`).send({}).expect(403);
    expect(JSON.stringify(note.body)).not.toMatch(/user_id|request_id|object_key/);
  });
  it('reading note create is idempotent after response loss and validates content and page bounds', async () => {
    const { path, versionId } = await readingFixture();
    const data = { pageNumber: 1, content: 'Same committed note', requestId: randomUUID() };
    const first = await readingWrite('student', `${path}/notes`, data);
    expect(first.status).toBe(201);
    const retry = await readingWrite('student', `${path}/notes`, data);
    expect(retry.status).toBe(201);
    expect(retry.body.item.id).toBe(first.body.item.id);
    expect(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM hucescholar.annotations WHERE user_id=$1 AND version_id=$2',
          [users.student, versionId],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (await readingWrite('student', `${path}/notes`, { ...data, content: 'different' })).status,
    ).toBe(409);
    for (const invalid of [
      { pageNumber: 0 },
      { pageNumber: 4 },
      { pageNumber: 1.5 },
      { content: ' ' },
      { content: 'x'.repeat(4001) },
      { requestId: 'bad' },
      { userId: users.other },
      { kind: 'TEXT_HIGHLIGHT' },
    ])
      expect(
        (
          await readingWrite('student', `${path}/notes`, {
            ...data,
            requestId: randomUUID(),
            ...invalid,
          })
        ).status,
      ).toBe(400);
    await agents.student.get(`${path}/notes?pageNumber=4`).expect(400);
    await agents.student.get(`${path}/notes?pageNumber=1&userId=${users.other}`).expect(400);
  });
  it('reading note revisions prevent concurrent edits and stale deletes', async () => {
    const { path } = await readingFixture();
    const created = await readingWrite('student', `${path}/notes`, {
      pageNumber: 1,
      content: 'original',
      requestId: randomUUID(),
    });
    expect(created.status).toBe(201);
    const target = `${path}/notes/${created.body.item.id}`;
    const csrf = (await agents.student.get('/api/v1/auth/csrf')).body.csrfToken;
    const updates = await Promise.all(
      ['tab A', 'tab B'].map((content) =>
        agents.student
          .patch(target)
          .set('Origin', origin)
          .set('X-CSRF-Token', csrf)
          .send({ revision: 1, content }),
      ),
    );
    expect(updates.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await readingWrite('student', target, { revision: 1 }, 'delete')).status).toBe(409);
    const persisted = (await agents.student.get(`${path}/notes?pageNumber=1`).expect(200)).body
      .items[0];
    expect(persisted.revision).toBe(2);
    expect(['tab A', 'tab B']).toContain(persisted.content);
    expect((await readingWrite('student', target, { revision: 2 }, 'delete')).status).toBe(204);
    expect((await agents.student.get(`${path}/notes?pageNumber=1`).expect(200)).body.items).toEqual(
      [],
    );
  });
  it('reading notes paginate only the selected owner, version and page', async () => {
    const { path, versionId } = await readingFixture();
    await agents.student.get(`${path}/notes?pageNumber=1`).expect(200);
    await db.query(
      "INSERT INTO hucescholar.annotations(user_id,version_id,page_number,kind,content) SELECT $1,$2,1,'PAGE_NOTE','note '||n FROM generate_series(1,32) n",
      [users.student, versionId],
    );
    const first = await agents.student.get(`${path}/notes?pageNumber=1`).expect(200);
    expect(first.body.items).toHaveLength(30);
    expect(first.body.nextCursor).toBe(first.body.items[29].id);
    const second = await agents.student
      .get(`${path}/notes?pageNumber=1&cursor=${first.body.nextCursor}`)
      .expect(200);
    expect(second.body.items).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();
    expect(
      new Set([...first.body.items, ...second.body.items].map((n: { id: string }) => n.id)).size,
    ).toBe(32);
    expect(
      (
        await agents.other
          .get(`${path}/notes?pageNumber=1&cursor=${first.body.nextCursor}`)
          .expect(200)
      ).body.items,
    ).toEqual([]);
    expect((await agents.student.get(`${path}/notes?pageNumber=2`).expect(200)).body.items).toEqual(
      [],
    );
  });
  it('reading progress restores the owner version and rejects stale concurrent writes', async () => {
    const { path } = await readingFixture();
    expect((await agents.student.get(`${path}/progress`).expect(200)).body.item).toBeNull();
    const initial = await readingWrite(
      'student',
      `${path}/progress`,
      { pageNumber: 2, revision: 0 },
      'put',
    );
    expect(initial.status).toBe(200);
    expect(initial.body.item).toMatchObject({ pageNumber: 2, revision: 1 });
    expect((await agents.admin.get(`${path}/progress`).expect(200)).body.item).toBeNull();
    expect((await agents.other.get(`${path}/progress`).expect(200)).body.item).toBeNull();
    const csrf = (await agents.student.get('/api/v1/auth/csrf')).body.csrfToken;
    const updates = await Promise.all(
      [1, 3].map((pageNumber) =>
        agents.student
          .put(`${path}/progress`)
          .set('Origin', origin)
          .set('X-CSRF-Token', csrf)
          .send({ pageNumber, revision: 1 }),
      ),
    );
    expect(updates.map((r) => r.status).sort()).toEqual([200, 409]);
    const saved = (await agents.student.get(`${path}/progress`).expect(200)).body.item;
    expect(saved.revision).toBe(2);
    expect([1, 3]).toContain(saved.pageNumber);
    expect(
      (await readingWrite('student', `${path}/progress`, { pageNumber: 1, revision: 0 }, 'put'))
        .status,
    ).toBe(409);
    for (const invalid of [
      { pageNumber: 4, revision: 2 },
      { pageNumber: 0, revision: 2 },
      { pageNumber: 1, revision: -1 },
      { pageNumber: 1, revision: 2, userId: users.other },
    ])
      expect((await readingWrite('student', `${path}/progress`, invalid, 'put')).status).toBe(400);
    await agents.student.put(`${path}/progress`).send({ pageNumber: 1, revision: 2 }).expect(403);
  });
  it('reading data stays version-bound and is retained but unavailable after hide or unsafe scan', async () => {
    const { path, id, versionId } = await readingFixture();
    const note = await readingWrite('student', `${path}/notes`, {
      pageNumber: 2,
      content: 'retained',
      requestId: randomUUID(),
    });
    expect(note.status).toBe(201);
    expect(
      (await readingWrite('student', `${path}/progress`, { pageNumber: 3, revision: 0 }, 'put'))
        .status,
    ).toBe(200);
    await db.query('UPDATE hucescholar.documents SET current_version_id=null WHERE id=$1', [id]);
    expect(
      (await agents.student.get(`${path}/notes?pageNumber=2`).expect(200)).body.items[0].content,
    ).toBe('retained');
    const notePath = `${path}/notes/${note.body.item.id}`;
    for (const state of ['hidden', 'unsafe']) {
      if (state === 'hidden')
        await db.query("UPDATE hucescholar.documents SET visibility='HIDDEN' WHERE id=$1", [id]);
      if (state === 'unsafe')
        await db.query("UPDATE hucescholar.documents SET visibility='VISIBLE' WHERE id=$1", [id]);
      if (state === 'unsafe')
        await db.query(
          "UPDATE hucescholar.files SET scan_status='FAILED' WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE id=$1)",
          [versionId],
        );
      for (const role of ['student', 'admin']) {
        await agents[role].get(`${path}/notes?pageNumber=2`).expect(404);
        await agents[role].get(`${path}/progress`).expect(404);
        expect(
          (
            await readingWrite(role, `${path}/notes`, {
              pageNumber: 1,
              content: 'blocked',
              requestId: randomUUID(),
            })
          ).status,
        ).toBe(404);
        expect(
          (await readingWrite(role, notePath, { content: 'blocked', revision: 1 }, 'patch')).status,
        ).toBe(404);
        expect((await readingWrite(role, notePath, { revision: 1 }, 'delete')).status).toBe(404);
        expect(
          (await readingWrite(role, `${path}/progress`, { pageNumber: 1, revision: 1 }, 'put'))
            .status,
        ).toBe(404);
      }
    }
    expect(
      (
        await db.query('SELECT content FROM hucescholar.annotations WHERE id=$1', [
          note.body.item.id,
        ])
      ).rows[0].content,
    ).toBe('retained');
    expect(
      (
        await db.query(
          'SELECT page_number FROM hucescholar.reading_progress WHERE user_id=$1 AND version_id=$2',
          [users.student, versionId],
        )
      ).rows[0].page_number,
    ).toBe(3);
  });
  it('reading endpoints refuse expired rights without deleting personal data', async () => {
    const item = await safeDraft();
    await db.query(
      "UPDATE hucescholar.document_versions SET rights_valid_until=now()-interval '1 day' WHERE id=$1",
      [item.versionId],
    );
    // Synthetic terminal fixture created directly; never edit an approved payload.
    await db.query(
      "UPDATE hucescholar.document_versions SET review_status='APPROVED' WHERE id=$1",
      [item.versionId],
    );
    const note = (
      await db.query(
        "INSERT INTO hucescholar.annotations(user_id,version_id,page_number,kind,content) VALUES($1,$2,1,'PAGE_NOTE','retained expired note') RETURNING id",
        [users.student, item.versionId],
      )
    ).rows[0];
    const path = `/api/v1/library/versions/${item.versionId}`;
    for (const role of ['student', 'admin']) {
      await agents[role].get(`${path}/notes?pageNumber=1`).expect(404);
      await agents[role].get(`${path}/progress`).expect(404);
      expect(
        (
          await readingWrite(role, `${path}/notes`, {
            pageNumber: 1,
            content: 'blocked',
            requestId: randomUUID(),
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await readingWrite(
            role,
            `${path}/notes/${note.id}`,
            { revision: 1, content: 'blocked' },
            'patch',
          )
        ).status,
      ).toBe(404);
      expect(
        (await readingWrite(role, `${path}/notes/${note.id}`, { revision: 1 }, 'delete')).status,
      ).toBe(404);
      expect(
        (await readingWrite(role, `${path}/progress`, { revision: 0, pageNumber: 1 }, 'put'))
          .status,
      ).toBe(404);
    }
    expect(
      (await db.query('SELECT content FROM hucescholar.annotations WHERE id=$1', [note.id])).rows[0]
        .content,
    ).toBe('retained expired note');
  });
  it('admin reviews a submitted snapshot and publishes atomically without opening HIDDEN', async () => {
    const item = await submitted('lecturer');
    await db.query("UPDATE hucescholar.documents SET visibility='HIDDEN' WHERE id=$1", [item.id]);
    const list = await agents.admin
      .get('/api/v1/admin/publication-requests?status=PENDING&limit=1')
      .expect(200);
    expect(list.body.total).toBeGreaterThan(0);
    const detail = await agents.admin
      .get(`/api/v1/admin/publication-requests/${item.requestId}`)
      .expect(200);
    expect(detail.body.item).toMatchObject({
      id: item.requestId,
      status: 'PENDING',
      submittedRevision: 3,
      versionRevision: 3,
      fileState: 'SAFE',
    });
    expect(JSON.stringify(detail.body)).not.toMatch(/object_key|quarantine\/|password_hash/);
    const pdf = await agents.admin
      .get(`/api/v1/admin/publication-requests/${item.requestId}/pdf`)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.headers['cache-control']).toBe('no-store');
    const result = await review(item.requestId, decision());
    expect(result.status).toBe(201);
    expect(result.body.item.status).toBe('APPROVED');
    expect(
      (
        await db.query(
          'SELECT current_version_id,visibility FROM hucescholar.documents WHERE id=$1',
          [item.id],
        )
      ).rows[0],
    ).toMatchObject({ current_version_id: item.versionId, visibility: 'HIDDEN' });
    expect(
      (await agents.lecturer.get(`/api/v1/material-drafts/${item.id}`)).body.item.reviewStatus,
    ).toBe('APPROVED');
    await expect(
      db.query("UPDATE hucescholar.document_versions SET title='Changed' WHERE id=$1", [
        item.versionId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('requests changes, reopens only the owned revision and keeps the decision in history', async () => {
    const item = await submitted();
    expect((await review(item.requestId, decision('CHANGES_REQUIRED'))).status).toBe(201);
    expect((await publication('other', item.id, 'reopen', { revision: 4 })).status).toBe(404);
    expect((await publication('student', item.id, 'reopen', { revision: 3 })).status).toBe(409);
    const reopened = await publication('student', item.id, 'reopen', { revision: 4 });
    expect(reopened.status).toBe(201);
    expect(reopened.body.item).toMatchObject({
      reviewStatus: 'DRAFT',
      revision: 5,
      editable: true,
    });
    const staleSnapshot = await agents.admin
      .get(`/api/v1/admin/publication-requests/${item.requestId}`)
      .expect(200);
    expect(staleSnapshot.body.item.snapshotMatches).toBe(false);
    await agents.admin.get(`/api/v1/admin/publication-requests/${item.requestId}/pdf`).expect(409);
    expect((await publication('student', item.id, 'submit', { revision: 5 })).status).toBe(201);
    const history = await agents.student
      .get(`/api/v1/material-drafts/${item.id}/requests`)
      .expect(200);
    expect(history.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'CHANGES_REQUIRED', reason: decision().reason }),
        expect.objectContaining({ status: 'PENDING' }),
      ]),
    );
  });
  it('rejects with a required reason and prevents changing the terminal result', async () => {
    const item = await submitted();
    expect((await review(item.requestId, { ...decision('REJECTED'), reason: ' ' })).status).toBe(
      400,
    );
    expect((await review(item.requestId, decision('REJECTED'))).status).toBe(201);
    expect((await review(item.requestId, decision())).status).toBe(409);
    expect((await publication('student', item.id, 'reopen', { revision: 4 })).status).toBe(409);
    expect(
      (
        await db.query('SELECT current_version_id FROM hucescholar.documents WHERE id=$1', [
          item.id,
        ])
      ).rows[0].current_version_id,
    ).toBeNull();
  });
  it('admin endpoints enforce role, CSRF, validation and snapshot revision', async () => {
    const item = await submitted();
    for (const name of ['student', 'lecturer']) {
      await agents[name].get('/api/v1/admin/publication-requests').expect(403);
      await agents[name]
        .get(`/api/v1/admin/publication-requests/${item.requestId}/pdf`)
        .expect(403);
      expect((await review(item.requestId, decision(), name)).status).toBe(403);
    }
    await agents.admin
      .post(`/api/v1/admin/publication-requests/${item.requestId}/decision`)
      .send(decision())
      .expect(403);
    expect((await review(item.requestId, { ...decision(), submittedRevision: 2 })).status).toBe(
      409,
    );
    expect(
      (await review(item.requestId, { ...decision(), rightsConfirmed: false })).body.code,
    ).toBe('RIGHTS_CONFIRMATION_REQUIRED');
    expect((await review(item.requestId, { ...decision(), visibility: 'VISIBLE' })).status).toBe(
      400,
    );
    await agents.admin.get('/api/v1/admin/publication-requests?status=bogus').expect(400);
    await agents.admin.get('/api/v1/admin/publication-requests/nope').expect(400);
  });
  it('rechecks unsafe files, expired rights, inactive courses and revoked assignments at approval', async () => {
    const item = await submitted('lecturer');
    await db.query(
      "UPDATE hucescholar.files SET scan_status='FAILED' WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE id=$1)",
      [item.versionId],
    );
    expect((await review(item.requestId, decision())).body.code).toBe('FILE_NOT_SAFE');
    await agents.admin.get(`/api/v1/admin/publication-requests/${item.requestId}/pdf`).expect(409);
    await db.query(
      "UPDATE hucescholar.files SET scan_status='SAFE' WHERE id=(SELECT file_id FROM hucescholar.document_versions WHERE id=$1)",
      [item.versionId],
    );
    await db.query('UPDATE hucescholar.courses SET is_active=false WHERE id=$1', [courses[0]]);
    try {
      expect((await review(item.requestId, decision())).body.code).toBe('COURSE_UNAVAILABLE');
    } finally {
      await db.query('UPDATE hucescholar.courses SET is_active=true WHERE id=$1', [courses[0]]);
    }
    const expired = await safeDraft();
    await db.query(
      "UPDATE hucescholar.document_versions SET rights_valid_until=now()+interval '1 second' WHERE id=$1",
      [expired.versionId],
    );
    expect((await publication('student', expired.id, 'submit', { revision: 2 })).status).toBe(201);
    await db.query('SELECT pg_sleep(1.1)');
    const pending = (
      await db.query(
        "SELECT id FROM hucescholar.publication_requests WHERE version_id=$1 AND status='PENDING'",
        [expired.versionId],
      )
    ).rows[0];
    expect((await review(pending.id, decision())).body.code).toBe('RIGHTS_EXPIRED');
    expect((await review(item.requestId, decision('CHANGES_REQUIRED'))).status).toBe(201);
  });
  it('serializes concurrent decisions and withdrawal, and rolls back when audit fails', async () => {
    const item = await submitted();
    const audit = jest
      .spyOn(app.get(MaterialsService), 'audit')
      .mockRejectedValueOnce(new Error('Synthetic audit failure'));
    try {
      expect((await review(item.requestId, decision())).status).toBe(500);
    } finally {
      audit.mockRestore();
    }
    expect(
      (
        await db.query('SELECT current_version_id FROM hucescholar.documents WHERE id=$1', [
          item.id,
        ])
      ).rows[0].current_version_id,
    ).toBeNull();
    expect(
      (await agents.admin.get(`/api/v1/admin/publication-requests/${item.requestId}`)).body.item
        .status,
    ).toBe('PENDING');
    const results = await Promise.all([
      review(item.requestId, decision()),
      publication('student', item.id, 'withdraw', { revision: 3, reason: 'Rút đồng thời' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const second = await submitted();
    const outcomes = await Promise.all([
      review(second.requestId, decision('REJECTED')),
      review(second.requestId, decision('CHANGES_REQUIRED')),
    ]);
    expect(outcomes.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it('blocks approval when the current manager is locked', async () => {
    const item = await submitted('other');
    await db.query("UPDATE hucescholar.users SET status='LOCKED' WHERE id=$1", [users.other]);
    try {
      expect((await review(item.requestId, decision())).body.code).toBe('MANAGER_UNAVAILABLE');
    } finally {
      await db.query("UPDATE hucescholar.users SET status='ACTIVE' WHERE id=$1", [users.other]);
    }
  });
  it('retains metadata after revocation but blocks edits even by dropping old courses', async () => {
    const item = await create();
    const submitted = await safeDraft('lecturer');
    expect((await publication('lecturer', submitted.id, 'submit', { revision: 2 })).status).toBe(
      201,
    );
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
    const pending = (
      await db.query(
        "SELECT id FROM hucescholar.publication_requests WHERE version_id=$1 AND status='PENDING'",
        [submitted.versionId],
      )
    ).rows[0];
    expect((await review(pending.id, decision())).body.code).toBe('ASSIGNMENT_REQUIRED');
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
    const withdrawn = await publication('lecturer', submitted.id, 'withdraw', {
      revision: 3,
      reason: 'Phân công đã thu hồi',
    });
    expect(withdrawn.status).toBe(201);
    expect(withdrawn.body.item).toMatchObject({
      reviewStatus: 'DRAFT',
      editable: false,
      editBlock: 'ASSIGNMENT_REQUIRED',
    });
    expect((await publication('lecturer', submitted.id, 'submit', { revision: 4 })).body.code).toBe(
      'ASSIGNMENT_REQUIRED',
    );
  });
});
