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
const prefix = `users-${randomBytes(6).toString('hex')}`;

describe('ADMIN account management', () => {
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
      throw new Error('Isolated test services required.');
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
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    for (const role of ['ADMIN', 'LECTURER', 'STUDENT']) {
      emails[role] = `${prefix}-${role.toLowerCase()}@example.test`;
      const result = await db.query(
        "INSERT INTO hucescholar.users(email,display_name,password_hash,role,status,verified_at) VALUES($1,$2,$3,$4,'ACTIVE',now()) RETURNING id",
        [emails[role], `Account fixture ${role}`, hash, role],
      );
      ids.push(result.rows[0].id);
    }
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    admin = request.agent(app.getHttpServer());
    await login(admin, emails.ADMIN).then((response) => expect(response.status).toBe(200));
  });

  afterAll(async () => {
    await app?.close();
    if (db) {
      await db.query('DELETE FROM hucescholar.audit_events WHERE actor_id=ANY($1::bigint[])', [
        ids,
      ]);
      await db.query('DELETE FROM hucescholar.auth_sessions WHERE user_id=ANY($1::bigint[])', [
        ids,
      ]);
      await db.query("DELETE FROM hucescholar.users WHERE id=ANY($1::bigint[]) AND role<>'ADMIN'", [
        ids,
      ]);
      await db.query('DELETE FROM hucescholar.users WHERE id=ANY($1::bigint[])', [ids]);
      await db.end();
    }
    await redis?.quit();
  });

  async function csrf(browser: Browser) {
    return (await browser.get('/api/v1/auth/csrf').expect(200)).body.csrfToken as string;
  }
  async function login(browser: Browser, email: string, secret = password) {
    const token = await csrf(browser);
    return browser
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({ email, password: secret });
  }
  async function changeOwnPassword(browser: Browser, currentPassword: string, newPassword: string) {
    return browser
      .post('/api/v1/auth/change-password')
      .set('Origin', origin)
      .set('X-CSRF-Token', await csrf(browser))
      .send({ currentPassword, newPassword });
  }
  async function resetPassword(browser: Browser, id: string, body: object) {
    return browser
      .post(`/api/v1/admin/users/${id}/password`)
      .set('Origin', origin)
      .set('X-CSRF-Token', await csrf(browser))
      .send(body);
  }
  async function create(suffix: string, role = 'STUDENT') {
    const response = await admin
      .post('/api/v1/admin/users')
      .set('Origin', origin)
      .set('X-CSRF-Token', await csrf(admin))
      .send({
        email: `${prefix}-${suffix}@example.test`,
        displayName: `Nguyễn ${suffix}`,
        role,
        password,
        eligibilityConfirmed: true,
      });
    if (response.body.user?.id) ids.push(response.body.user.id);
    expect(response.status).toBe(201);
    return response.body.user as {
      id: string;
      revision: number;
      email: string;
      displayName: string;
      status: string;
    };
  }
  async function patch(id: string, body: object, status = false) {
    return admin
      .patch(`/api/v1/admin/users/${id}${status ? '/status' : ''}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', await csrf(admin))
      .send(body);
  }

  it('rejects anonymous, lecturer and student list access', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/users').expect(401);
    for (const role of ['LECTURER', 'STUDENT']) {
      const browser = request.agent(app.getHttpServer());
      await login(browser, emails[role]).then((response) => expect(response.status).toBe(200));
      await browser.get('/api/v1/admin/users').expect(403);
      await browser
        .post('/api/v1/admin/users')
        .set('Origin', origin)
        .set('X-CSRF-Token', await csrf(browser))
        .send({})
        .expect(403);
      await browser
        .patch(`/api/v1/admin/users/${ids[2]}`)
        .set('Origin', origin)
        .set('X-CSRF-Token', await csrf(browser))
        .send({})
        .expect(403);
      await browser
        .patch(`/api/v1/admin/users/${ids[2]}/status`)
        .set('Origin', origin)
        .set('X-CSRF-Token', await csrf(browser))
        .send({})
        .expect(403);
    }
  });

  it('creates a verified account with safe projection, hash and audit; it can log in', async () => {
    const user = await create('created', 'LECTURER');
    expect(user).toEqual(
      expect.objectContaining({ id: expect.any(String), status: 'ACTIVE', revision: 1 }),
    );
    expect(Object.keys(user).sort()).toEqual(
      [
        'createdAt',
        'displayName',
        'email',
        'id',
        'mustChangePassword',
        'revision',
        'role',
        'status',
        'updatedAt',
        'verifiedAt',
      ].sort(),
    );
    const stored = (
      await db.query(
        'SELECT password_hash,verified_by,verified_at FROM hucescholar.users WHERE id=$1',
        [user.id],
      )
    ).rows[0];
    expect(await argon2.verify(stored.password_hash, password)).toBe(true);
    expect(stored.verified_by).toBe(ids[0]);
    expect(stored.verified_at).not.toBeNull();
    const audit = (
      await db.query(
        "SELECT * FROM hucescholar.audit_events WHERE entity_type='USER' AND entity_id=$1",
        [user.id],
      )
    ).rows;
    expect(audit).toEqual([
      expect.objectContaining({ event_type: 'ACCOUNT_CREATED', actor_id: ids[0] }),
    ]);
    expect(JSON.stringify(audit)).not.toContain(password);
    expect(JSON.stringify(audit)).not.toContain(stored.password_hash);
    await login(request.agent(app.getHttpServer()), user.email).then((response) =>
      expect(response.status).toBe(200),
    );
  });

  it('normalizes email and prevents duplicates including simultaneous creates', async () => {
    const data = {
      email: `  ${prefix.toUpperCase()}-NORMAL@example.test  `,
      displayName: '  Nguyễn An  ',
      role: 'STUDENT',
      password,
      eligibilityConfirmed: true,
    };
    const token = await csrf(admin);
    const results = await Promise.all(
      [1, 2].map(() =>
        admin
          .post('/api/v1/admin/users')
          .set('Origin', origin)
          .set('X-CSRF-Token', token)
          .send(data),
      ),
    );
    for (const result of results) if (result.body.user?.id) ids.push(result.body.user.id);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(results.find((result) => result.status === 201)?.body.user).toEqual(
      expect.objectContaining({ email: `${prefix}-normal@example.test`, displayName: 'Nguyễn An' }),
    );
  });

  it.each([
    { password: 'short' },
    { password: 'x'.repeat(129) },
    { displayName: '   ' },
    { email: 'invalid' },
    { role: 'ADMIN' },
    { eligibilityConfirmed: false },
    { eligibilityConfirmed: undefined },
    { status: 'ACTIVE' },
    { verified_by: 1 },
  ])('validates account creation without mass assignment: %j', async (invalid) => {
    await admin
      .post('/api/v1/admin/users')
      .set('Origin', origin)
      .set('X-CSRF-Token', await csrf(admin))
      .send({
        email: `${prefix}-bad@example.test`,
        displayName: 'Valid name',
        password,
        role: 'STUDENT',
        eligibilityConfirmed: true,
        ...invalid,
      })
      .expect(400);
  });

  it('requires CSRF for all mutations', async () => {
    await admin.post('/api/v1/admin/users').send({}).expect(403);
    await admin.patch(`/api/v1/admin/users/${ids[2]}`).send({}).expect(403);
    await admin.patch(`/api/v1/admin/users/${ids[2]}/status`).send({}).expect(403);
  });

  it('filters and paginates a safe, stable list', async () => {
    const response = await admin
      .get('/api/v1/admin/users')
      .query({ search: prefix, role: 'STUDENT', page: 1, limit: 1 })
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(response.body).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 1,
        total: expect.any(Number),
        items: expect.any(Array),
      }),
    );
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].role).toBe('STUDENT');
    expect(JSON.stringify(response.body)).not.toMatch(/password|token_hash/);
    await admin
      .get('/api/v1/admin/users')
      .query({ search: `${prefix}-missing` })
      .expect(200)
      .then((result) => expect(result.body.total).toBe(0));
    const named = await admin
      .get('/api/v1/admin/users')
      .query({ search: 'Nguyễn created', role: 'LECTURER', status: 'ACTIVE' })
      .expect(200);
    expect(
      named.body.items.some(
        (item: { displayName: string }) => item.displayName === 'Nguyễn created',
      ),
    ).toBe(true);
  });

  it.each([
    'page=0',
    'page=1.2',
    'page=999999999',
    'limit=101',
    'limit=abc',
    'status=bad',
    'role=OWNER',
    'search=x&unknown=1',
  ])('rejects invalid query %s', async (query) => {
    await admin.get(`/api/v1/admin/users?${query}`).expect(400);
  });

  it('edits profile, handles stale/concurrent revision and revokes sessions when email changes', async () => {
    const user = await create('edit');
    const browser = request.agent(app.getHttpServer());
    await login(browser, user.email).then((response) => expect(response.status).toBe(200));
    const renamed = await patch(user.id, {
      email: user.email,
      displayName: 'Tên mới',
      revision: user.revision,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.user.revision).toBe(2);
    await browser.get('/api/v1/auth/me').expect(200);
    const token = await csrf(admin);
    const edits = await Promise.all(
      ['a', 'b'].map((suffix) =>
        admin
          .patch(`/api/v1/admin/users/${user.id}`)
          .set('Origin', origin)
          .set('X-CSRF-Token', token)
          .send({
            email: `${prefix}-edit-${suffix}@example.test`,
            displayName: 'Tên mới',
            revision: 2,
          }),
      ),
    );
    expect(edits.map((result) => result.status).sort()).toEqual([200, 409]);
    await browser.get('/api/v1/auth/me').expect(401);
    expect(
      (await patch(user.id, { email: user.email, displayName: 'Stale', revision: 1 })).status,
    ).toBe(409);
    const stored = (
      await db.query('SELECT revision,display_name FROM hucescholar.users WHERE id=$1', [user.id])
    ).rows[0];
    expect(stored).toEqual({ revision: 3, display_name: 'Tên mới' });
  });

  it('locks and unlocks without reviving previous sessions', async () => {
    const user = await create('lock');
    const browser = request.agent(app.getHttpServer());
    await login(browser, user.email).then((response) => expect(response.status).toBe(200));
    const locked = await patch(user.id, { status: 'LOCKED', revision: 1 }, true);
    expect(locked.status).toBe(200);
    await browser.get('/api/v1/auth/me').expect(401);
    await login(request.agent(app.getHttpServer()), user.email).then((response) =>
      expect(response.status).toBe(401),
    );
    const filtered = await admin
      .get('/api/v1/admin/users')
      .query({ search: user.email, status: 'LOCKED' })
      .expect(200);
    expect(filtered.body.total).toBe(1);
    expect(
      (await patch(user.id, { status: 'ACTIVE', revision: locked.body.user.revision }, true))
        .status,
    ).toBe(200);
    await browser.get('/api/v1/auth/me').expect(401);
    await login(request.agent(app.getHttpServer()), user.email).then((response) =>
      expect(response.status).toBe(200),
    );
  });

  it('verifies pending users only with explicit eligibility confirmation', async () => {
    const user = await create('pending');
    await db.query(
      "UPDATE hucescholar.users SET status='PENDING',verified_at=NULL,verified_by=NULL WHERE id=$1",
      [user.id],
    );
    expect((await patch(user.id, { status: 'ACTIVE', revision: 1 }, true)).status).toBe(400);
    const verified = await patch(
      user.id,
      { status: 'ACTIVE', revision: 1, eligibilityConfirmed: true },
      true,
    );
    expect(verified.status).toBe(200);
    expect(verified.body.user.verifiedAt).toEqual(expect.any(String));
    expect(
      (await db.query('SELECT verified_by FROM hucescholar.users WHERE id=$1', [user.id])).rows[0]
        .verified_by,
    ).toBe(ids[0]);
  });

  it('protects administrators and rejects role/password changes', async () => {
    expect(
      (await patch(ids[0], { email: emails.ADMIN, displayName: 'Changed', revision: 1 })).status,
    ).toBe(403);
    expect((await patch(ids[0], { status: 'LOCKED', revision: 1 }, true)).status).toBe(403);
    for (const extra of [{ role: 'ADMIN' }, { password }, { status: 'LOCKED' }]) {
      expect(
        (
          await patch(ids[2], {
            email: emails.STUDENT,
            displayName: 'Changed',
            revision: 1,
            ...extra,
          })
        ).status,
      ).toBe(400);
    }
  });

  it('handles duplicate edits and invalid or missing IDs without server errors', async () => {
    const user = await create('duplicate');
    expect(
      (await patch(user.id, { email: emails.STUDENT, displayName: 'Changed', revision: 1 })).status,
    ).toBe(409);
    for (const id of ['0', '-1', 'abc', '9223372036854775808']) {
      expect((await patch(id, { status: 'LOCKED', revision: 1 }, true)).status).toBe(400);
    }
    expect(
      (await patch('9223372036854775807', { status: 'LOCKED', revision: 1 }, true)).status,
    ).toBe(404);
    expect((await patch(user.id, { status: 'PENDING', revision: 1 }, true)).status).toBe(400);
    expect((await patch(user.id, { status: 'LOCKED', revision: '1' }, true)).status).toBe(400);
  });

  it('loads the current account for conflict reconciliation and protects the endpoint', async () => {
    const user = await create('refresh');
    const response = await admin
      .get(`/api/v1/admin/users/${user.id}`)
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(response.body.user.email).toBe(user.email);
    expect(JSON.stringify(response.body)).not.toContain('password');
    await request(app.getHttpServer()).get(`/api/v1/admin/users/${user.id}`).expect(401);
    const student = request.agent(app.getHttpServer());
    await login(student, emails.STUDENT);
    await student.get(`/api/v1/admin/users/${user.id}`).expect(403);
    await admin.get('/api/v1/admin/users/9223372036854775807').expect(404);
    await admin.get('/api/v1/admin/users/9223372036854775808').expect(400);
  });

  it('revokes sessions safely when the database session clock is ahead of the API clock', async () => {
    const user = await create('clock');
    const browser = request.agent(app.getHttpServer());
    await login(browser, user.email).then((response) => expect(response.status).toBe(200));
    await db.query(
      "UPDATE hucescholar.auth_sessions SET created_at=now()+interval '5 minutes' WHERE user_id=$1",
      [user.id],
    );
    const changed = await patch(user.id, {
      email: `${prefix}-clock-new@example.test`,
      displayName: 'Clock test',
      revision: 1,
    });
    expect(changed.status).toBe(200);
    const session = (
      await db.query(
        'SELECT revoked_at>=created_at AS valid FROM hucescholar.auth_sessions WHERE user_id=$1',
        [user.id],
      )
    ).rows[0];
    expect(session.valid).toBe(true);
    await browser.get('/api/v1/auth/me').expect(401);
  });

  it('requires an issued password to be changed before any other workspace request', async () => {
    const user = await create('forced', 'STUDENT');
    expect(user).toEqual(expect.objectContaining({ mustChangePassword: true }));
    const browser = request.agent(app.getHttpServer());
    const signedIn = await login(browser, user.email);
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.user.mustChangePassword).toBe(true);
    expect((await browser.get('/api/v1/auth/me').expect(200)).body.user.mustChangePassword).toBe(
      true,
    );
    for (const path of ['/api/v1/workspace/student', '/api/v1/account/profile', '/api/v1/library'])
      expect((await browser.get(path).expect(403)).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await changeOwnPassword(browser, password, password)).status).toBe(400);
    const replacement = randomBytes(24).toString('base64url');
    expect((await changeOwnPassword(browser, password, replacement)).status).toBe(204);
    expect((await browser.get('/api/v1/auth/me').expect(200)).body.user.mustChangePassword).toBe(
      false,
    );
    await browser.get('/api/v1/workspace/student').expect(200);
    const stored = (
      await db.query('SELECT must_change_password FROM hucescholar.users WHERE id=$1', [user.id])
    ).rows[0];
    expect(stored.must_change_password).toBe(false);
  });

  it('lets a pending account sign out and keeps existing accounts unflagged', async () => {
    const user = await create('forced-logout');
    const browser = request.agent(app.getHttpServer());
    await login(browser, user.email).then((response) => expect(response.status).toBe(200));
    await browser
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', await csrf(browser))
      .expect(204);
    await browser.get('/api/v1/auth/me').expect(401);
    const fixture = (
      await db.query('SELECT must_change_password FROM hucescholar.users WHERE id=$1', [ids[2]])
    ).rows[0];
    expect(fixture.must_change_password).toBe(false);
  });

  it('resets a password to a temporary one, revoking sessions and old credentials', async () => {
    const user = await create('reset', 'LECTURER');
    const owner = request.agent(app.getHttpServer());
    await login(owner, user.email);
    const settled = randomBytes(24).toString('base64url');
    expect((await changeOwnPassword(owner, password, settled)).status).toBe(204);
    const current = (await admin.get(`/api/v1/admin/users/${user.id}`).expect(200)).body.user;
    expect(current.mustChangePassword).toBe(false);
    const temporary = randomBytes(24).toString('base64url');
    expect((await resetPassword(admin, user.id, { password: temporary, revision: 1 })).status).toBe(
      409,
    );
    expect(
      (await resetPassword(admin, user.id, { password: 'short', revision: current.revision }))
        .status,
    ).toBe(400);
    const reset = await resetPassword(admin, user.id, {
      password: temporary,
      revision: current.revision,
    });
    expect(reset.status).toBe(200);
    expect(reset.body.user).toEqual(
      expect.objectContaining({ mustChangePassword: true, revision: current.revision + 1 }),
    );
    expect(JSON.stringify(reset.body)).not.toContain(temporary);
    await owner.get('/api/v1/auth/me').expect(401);
    expect((await login(request.agent(app.getHttpServer()), user.email, settled)).status).toBe(401);
    const next = request.agent(app.getHttpServer());
    const signedIn = await login(next, user.email, temporary);
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.user.mustChangePassword).toBe(true);
    await next.get('/api/v1/workspace/lecturer').expect(403);
    const audit = (
      await db.query(
        "SELECT actor_id FROM hucescholar.audit_events WHERE entity_type='USER' AND entity_id=$1 AND event_type='ACCOUNT_PASSWORD_RESET'",
        [user.id],
      )
    ).rows;
    expect(audit).toEqual([{ actor_id: ids[0] }]);
  });

  it('allows only an admin to reset non-admin passwords', async () => {
    const temporary = randomBytes(24).toString('base64url');
    const adminRow = (await admin.get(`/api/v1/admin/users/${ids[0]}`).expect(200)).body.user;
    expect(
      (await resetPassword(admin, ids[0], { password: temporary, revision: adminRow.revision }))
        .status,
    ).toBe(403);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/users/${ids[2]}/password`)
      .send({ password: temporary, revision: 1 })
      .expect(403);
    const lecturer = request.agent(app.getHttpServer());
    await login(lecturer, emails.LECTURER);
    expect(
      (await resetPassword(lecturer, ids[2], { password: temporary, revision: 1 })).status,
    ).toBe(403);
    expect(
      (await resetPassword(admin, '9223372036854775807', { password: temporary, revision: 1 }))
        .status,
    ).toBe(404);
  });
});
