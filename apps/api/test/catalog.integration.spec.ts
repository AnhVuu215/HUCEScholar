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
    configureApplication(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    admin = request.agent(app.getHttpServer());
    await login(admin, 'ADMIN');
  });
  afterAll(async () => {
    await app?.close();
    if (db) {
      await db.query('DELETE FROM hucescholar.audit_events WHERE actor_id=ANY($1::bigint[])', [
        ids,
      ]);
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
