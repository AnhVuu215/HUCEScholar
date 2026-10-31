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
import { passwordOptions } from '../src/auth/auth.service';
import { LoginRateLimiter } from '../src/auth/login-rate-limiter';

type Browser = ReturnType<typeof request.agent>;
const origin = 'http://127.0.0.1:3100';
const password = randomBytes(24).toString('base64url');
describe('self-service account with real sessions and PostgreSQL', () => {
  let app: INestApplication, db: Client, redis: Redis, hash: string;
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? '');
    const redisUrl = new URL(process.env.TEST_REDIS_URL ?? '');
    if (!url.pathname.endsWith('_test') || redisUrl.pathname !== '/15')
      throw new Error('Isolated test services required.');
    process.env.DATABASE_URL = url.href;
    process.env.REDIS_URL = redisUrl.href;
    process.env.APP_ORIGIN = origin;
    process.env.NODE_ENV = 'test';
    db = new Client({ connectionString: url.href });
    await db.connect();
    redis = new Redis(redisUrl.href);
    hash = await argon2.hash(password, passwordOptions);
    for (const role of ['ADMIN', 'LECTURER', 'STUDENT']) {
      const result = await db.query(
        "INSERT INTO hucescholar.users(email,display_name,password_hash,role,status,verified_at) VALUES($1,$2,$3,$4,'ACTIVE',now()) RETURNING id",
        [`self-${role.toLowerCase()}@example.test`, `${role} test`, hash, role],
      );
      ids[role] = result.rows[0].id;
    }
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    if ((await db.query("SELECT to_regclass('hucescholar.user_preferences') AS id")).rows[0].id)
      await db.query('DELETE FROM hucescholar.user_preferences WHERE user_id=ANY($1::bigint[])', [
        Object.values(ids),
      ]);
    await db.query('DELETE FROM hucescholar.auth_sessions WHERE user_id=ANY($1::bigint[])', [
      Object.values(ids),
    ]);
    for (const [role, id] of Object.entries(ids))
      await db.query(
        "UPDATE hucescholar.users SET email=$1,display_name=$2,password_hash=$3,status='ACTIVE',verified_at=clock_timestamp(),role=$4,revision=1 WHERE id=$5",
        [`self-${role.toLowerCase()}@example.test`, `${role} test`, hash, role, id],
      );
    await redis.flushdb();
  });
  afterAll(async () => {
    await app?.close();
    if (db) {
      for (const table of ['audit_events', 'password_reset_tokens', 'auth_sessions'])
        await db.query(
          `DELETE FROM hucescholar.${table} WHERE ${table === 'audit_events' ? 'actor_id' : 'user_id'}=ANY($1::bigint[])`,
          [Object.values(ids)],
        );
      await db.query('DELETE FROM hucescholar.users WHERE id=ANY($1::bigint[])', [
        Object.values(ids),
      ]);
      await db.end();
    }
    await redis?.quit();
  });
  async function csrf(agent: Browser) {
    return (await agent.get('/api/v1/auth/csrf').expect(200)).body.csrfToken as string;
  }
  async function login(role = 'STUDENT', supplied = password) {
    const agent = request.agent(app.getHttpServer());
    const token = await csrf(agent);
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({ email: `self-${role.toLowerCase()}@example.test`, password: supplied })
      .expect(200);
    return agent;
  }
  async function patch(agent: Browser, body: object) {
    const token = await csrf(agent);
    return agent
      .patch('/api/v1/account/profile')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send(body);
  }
  async function change(agent: Browser, currentPassword: string, newPassword: string) {
    const token = await csrf(agent);
    return agent
      .post('/api/v1/auth/change-password')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({ currentPassword, newPassword });
  }
  async function preferences(agent: Browser, body: object) {
    const token = await csrf(agent);
    return agent
      .put('/api/v1/account/preferences')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send(body);
  }
  async function waitingForUserLock(count = 1) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const result = await db.query(
        "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND wait_event_type='Lock' AND query ILIKE '%FROM hucescholar.users%' AND pid<>pg_backend_pid()",
      );
      if ((result.rowCount ?? 0) >= count) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error('Request did not reach the controlled user lock.');
  }
  it.each(['ADMIN', 'LECTURER', 'STUDENT'])(
    '%s changes only its display name with revision and safe audit',
    async (role) => {
      const agent = await login(role);
      const before = await agent
        .get('/api/v1/account/profile')
        .expect(200)
        .expect('Cache-Control', 'no-store');
      expect(Object.keys(before.body.user).sort()).toEqual([
        'displayName',
        'email',
        'id',
        'mustChangePassword',
        'revision',
        'role',
      ]);
      const changed = await patch(agent, {
        displayName: '  Nguyễn <b>Học</b>  ',
        revision: before.body.user.revision,
      });
      expect(changed.status).toBe(200);
      expect(changed.body.user).toEqual({
        ...before.body.user,
        displayName: 'Nguyễn <b>Học</b>',
        revision: 2,
      });
      expect((await agent.get('/api/v1/auth/me').expect(200)).body.user.displayName).toBe(
        'Nguyễn <b>Học</b>',
      );
      const audit = await db.query(
        'SELECT event_type,entity_type,entity_id,reason_code,request_id FROM hucescholar.audit_events WHERE actor_id=$1 ORDER BY id DESC LIMIT 1',
        [ids[role]],
      );
      expect(audit.rows[0]).toEqual({
        event_type: 'SELF_PROFILE_UPDATED',
        entity_type: 'USER',
        entity_id: ids[role],
        reason_code: null,
        request_id: null,
      });
    },
  );
  it('rejects unknown fields, invalid names/revisions, CSRF and unauthenticated access', async () => {
    await request(app.getHttpServer()).get('/api/v1/account/profile').expect(401);
    const agent = await login();
    for (const extra of ['email', 'role', 'userId', 'status'])
      expect(
        (await patch(agent, { displayName: 'Name', revision: 1, [extra]: 'ADMIN' })).status,
      ).toBe(400);
    for (const displayName of ['', '   ', 'x'.repeat(151)])
      expect((await patch(agent, { displayName, revision: 1 })).status).toBe(400);
    for (const revision of [0, -1, 1.5, '1', 2147483647])
      expect((await patch(agent, { displayName: 'Name', revision })).status).toBe(400);
    await agent
      .patch('/api/v1/account/profile')
      .set('Origin', origin)
      .send({ displayName: 'Name', revision: 1 })
      .expect(403);
    expect((await patch(agent, { displayName: 'x'.repeat(150), revision: 1 })).status).toBe(200);
    expect((await patch(agent, { displayName: 'stale', revision: 1 })).status).toBe(409);
    await db.query("UPDATE hucescholar.users SET status='LOCKED' WHERE id=$1", [ids.STUDENT]);
    expect((await patch(agent, { displayName: 'Locked', revision: 2 })).status).toBe(401);
  });
  it('serializes profile races and never overwrites a concurrent administrator edit', async () => {
    const agent = await login();
    const results = await Promise.all([
      patch(agent, { displayName: 'First', revision: 1 }),
      patch(agent, { displayName: 'Second', revision: 1 }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const current = (await agent.get('/api/v1/account/profile').expect(200)).body.user;
    expect(current.revision).toBe(2);
    await db.query('UPDATE hucescholar.users SET display_name=$1,revision=revision+1 WHERE id=$2', [
      'Administrator edit',
      ids.STUDENT,
    ]);
    expect((await patch(agent, { displayName: 'Old tab', revision: 2 })).status).toBe(409);
    expect((await agent.get('/api/v1/account/profile').expect(200)).body.user.displayName).toBe(
      'Administrator edit',
    );
  });
  it('rechecks account status after waiting for a PostgreSQL row lock', async () => {
    const agent = await login();
    const blocker = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await blocker.connect();
    let pending: ReturnType<typeof patch> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM hucescholar.users WHERE id=$1 FOR UPDATE', [ids.STUDENT]);
      pending = patch(agent, { displayName: 'Blocked request', revision: 1 });
      await waitingForUserLock();
      await blocker.query("UPDATE hucescholar.users SET status='LOCKED' WHERE id=$1", [
        ids.STUDENT,
      ]);
      await blocker.query('COMMIT');
      expect((await pending).status).toBe(401);
      expect(
        (await db.query('SELECT display_name FROM hucescholar.users WHERE id=$1', [ids.STUDENT]))
          .rows[0].display_name,
      ).toBe('STUDENT test');
    } finally {
      await blocker.query('ROLLBACK');
      await pending;
      await blocker.end();
    }
  });
  it.each(['ADMIN', 'LECTURER', 'STUDENT'])(
    '%s rotates its session, revokes other browsers and keeps the absolute expiry',
    async (role) => {
      const first = await login(role);
      const before = await db.query(
        'SELECT max(expires_at) expiry FROM hucescholar.auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',
        [ids[role]],
      );
      const second = await login(role);
      await db.query(
        "INSERT INTO hucescholar.password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')",
        [ids[role], randomBytes(32).toString('hex')],
      );
      const replacement = randomBytes(24).toString('base64url');
      const result = await change(first, password, replacement);
      expect(result.status).toBe(204);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(Array.isArray(result.headers['set-cookie'])).toBe(true);
      await first.get('/api/v1/auth/me').expect(200);
      await second.get('/api/v1/auth/me').expect(401);
      const sessions = await db.query(
        'SELECT expires_at FROM hucescholar.auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',
        [ids[role]],
      );
      expect(sessions.rows).toHaveLength(1);
      expect(sessions.rows[0].expires_at.getTime() <= before.rows[0].expiry.getTime()).toBe(true);
      const reset = await db.query(
        'SELECT count(*)::int n FROM hucescholar.password_reset_tokens WHERE user_id=$1 AND used_at IS NULL',
        [ids[role]],
      );
      expect(reset.rows[0].n).toBe(0);
      const token = await csrf(first);
      const oldLogin = await first
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .send({ email: `self-${role.toLowerCase()}@example.test`, password });
      expect(oldLogin.status).toBe(401);
      await login(role, replacement);
      const audit = await db.query(
        'SELECT event_type,reason_code,request_id FROM hucescholar.audit_events WHERE actor_id=$1 ORDER BY id DESC LIMIT 1',
        [ids[role]],
      );
      expect(audit.rows[0]).toEqual({
        event_type: 'ACCOUNT_PASSWORD_CHANGED',
        reason_code: null,
        request_id: null,
      });
    },
  );
  it('rejects invalid input, same password, wrong current, CSRF/origin and honors independent quotas', async () => {
    const agent = await login();
    for (const newPassword of ['a'.repeat(15), '🙂'.repeat(15), '🙂'.repeat(65)])
      expect((await change(agent, password, newPassword)).status).toBe(400);
    const token = await csrf(agent);
    await agent
      .post('/api/v1/auth/change-password')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({ currentPassword: password, newPassword: 'x'.repeat(16), userId: ids.ADMIN })
      .expect(400);
    await agent
      .post('/api/v1/auth/change-password')
      .set('Origin', origin)
      .send({ currentPassword: password, newPassword: 'x'.repeat(16) })
      .expect(403);
    await agent
      .post('/api/v1/auth/change-password')
      .set('Origin', 'https://other.example.test')
      .set('X-CSRF-Token', token)
      .send({ currentPassword: password, newPassword: 'x'.repeat(16) })
      .expect(403);
    const same = await change(agent, password, password);
    expect(same.status).toBe(400);
    expect(same.body.code).toBe('INVALID_PASSWORD_INPUT');
    for (let index = 0; index < 4; index++) {
      const wrong = await change(agent, 'incorrect current', 'x'.repeat(16));
      expect(wrong.status).toBe(400);
      expect(wrong.body.code).toBe('INVALID_CURRENT_PASSWORD');
      expect(JSON.stringify(wrong.body).includes('incorrect current')).toBe(false);
    }
    expect((await change(agent, password, 'x'.repeat(16))).status).toBe(429);
    await login(); // Password-change quota does not consume login's email bucket.
    const limiter = app.get(LoginRateLimiter);
    for (let index = 0; index < 30; index++)
      await limiter.checkPasswordChange('quota-test-ip', String(index));
    await expect(limiter.checkPasswordChange('quota-test-ip', '100')).rejects.toMatchObject({
      status: 429,
    });
  });
  it('accepts a Unicode password with spaces without normalizing or extending expiry', async () => {
    const agent = await login();
    const replacement = `  ${'🙂'.repeat(16)}  `;
    expect((await change(agent, password, replacement)).status).toBe(204);
    await login('STUDENT', replacement);
  });
  it('serializes two password changes that both verified the old hash before acquiring the user lock', async () => {
    const first = await login(),
      second = await login();
    const blocker = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await blocker.connect();
    const replacements = [
      randomBytes(24).toString('base64url'),
      randomBytes(24).toString('base64url'),
    ];
    let pending: Promise<Awaited<ReturnType<typeof change>>[]> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM hucescholar.users WHERE id=$1 FOR UPDATE', [ids.STUDENT]);
      pending = Promise.all([
        change(first, password, replacements[0]),
        change(second, password, replacements[1]),
      ]);
      await waitingForUserLock(2);
      await blocker.query('COMMIT');
      const results = await pending;
      expect(results.filter((result) => result.status === 204)).toHaveLength(1);
      expect(results.filter((result) => [401, 409].includes(result.status))).toHaveLength(1);
      await login('STUDENT', replacements[results.findIndex((result) => result.status === 204)]);
    } finally {
      await blocker.query('ROLLBACK');
      await pending;
      await blocker.end();
    }
  });
  it.each(['locked', 'unverified', 'revoked', 'expired', 'email'])(
    'rechecks %s after the password-change request waits for a real row lock',
    async (state) => {
      const agent = await login();
      await db.query(
        "UPDATE hucescholar.auth_sessions SET created_at=clock_timestamp()-interval '2 hours' WHERE user_id=$1",
        [ids.STUDENT],
      );
      const blocker = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      await blocker.connect();
      let pending: ReturnType<typeof change> | undefined;
      try {
        await blocker.query('BEGIN');
        await blocker.query('SELECT id FROM hucescholar.users WHERE id=$1 FOR UPDATE', [
          ids.STUDENT,
        ]);
        pending = change(agent, password, randomBytes(24).toString('base64url'));
        await waitingForUserLock();
        if (state === 'locked')
          await blocker.query("UPDATE hucescholar.users SET status='LOCKED' WHERE id=$1", [
            ids.STUDENT,
          ]);
        if (state === 'unverified')
          await blocker.query(
            "UPDATE hucescholar.users SET status='PENDING',verified_at=NULL WHERE id=$1",
            [ids.STUDENT],
          );
        if (state === 'email')
          await blocker.query(
            "UPDATE hucescholar.users SET email='changed-self@example.test' WHERE id=$1",
            [ids.STUDENT],
          );
        if (state === 'revoked')
          await blocker.query(
            'UPDATE hucescholar.auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=$1',
            [ids.STUDENT],
          );
        if (state === 'expired')
          await blocker.query(
            "UPDATE hucescholar.auth_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id=$1",
            [ids.STUDENT],
          );
        await blocker.query('COMMIT');
        const result = await pending;
        expect(result.status).toBe(state === 'email' ? 409 : 401);
        expect(result.headers['set-cookie']).toBeUndefined();
        expect(
          (
            await db.query(
              'SELECT password_hash=$2 AS same,revision FROM hucescholar.users WHERE id=$1',
              [ids.STUDENT, hash],
            )
          ).rows[0],
        ).toEqual({ same: true, revision: 1 });
      } finally {
        await blocker.query('ROLLBACK');
        await pending;
        await blocker.end();
      }
    },
  );
  it('rejects a login that verified the old password before a concurrent credential commit', async () => {
    const replacement = randomBytes(24).toString('base64url'),
      replacementHash = await argon2.hash(replacement, passwordOptions);
    const agent = request.agent(app.getHttpServer());
    const token = await csrf(agent);
    const blocker = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await blocker.connect();
    let pending: Promise<request.Response> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM hucescholar.users WHERE id=$1 FOR UPDATE', [ids.STUDENT]);
      pending = agent
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .send({ email: 'self-student@example.test', password })
        .then((result) => result);
      await waitingForUserLock();
      await blocker.query('UPDATE hucescholar.users SET password_hash=$1 WHERE id=$2', [
        replacementHash,
        ids.STUDENT,
      ]);
      await blocker.query('COMMIT');
      const result = await pending;
      expect(result.status).toBe(401);
      expect(result.headers['set-cookie']).toBeUndefined();
      await login('STUDENT', replacement);
    } finally {
      await blocker.query('ROLLBACK');
      await pending;
      await blocker.end();
    }
  });
  it.each(['auth_sessions', 'audit_events'])(
    'rolls back password, revisions, sessions and reset tokens if %s insert fails',
    async (table) => {
      const agent = await login();
      await db.query(
        "INSERT INTO hucescholar.password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')",
        [ids.STUDENT, randomBytes(32).toString('hex')],
      );
      const column = table === 'auth_sessions' ? 'user_id' : 'actor_id';
      await db.query(
        `CREATE FUNCTION hucescholar.self_service_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.${column}=${BigInt(ids.STUDENT)} THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$`,
      );
      try {
        await db.query(
          `CREATE TRIGGER self_service_test_failure BEFORE INSERT ON hucescholar.${table} FOR EACH ROW EXECUTE FUNCTION hucescholar.self_service_test_failure()`,
        );
        const result = await change(agent, password, randomBytes(24).toString('base64url'));
        expect(result.status).toBe(503);
        expect(result.headers['set-cookie']).toBeUndefined();
        expect(
          (
            await db.query(
              'SELECT password_hash=$2 AS same,revision FROM hucescholar.users WHERE id=$1',
              [ids.STUDENT, hash],
            )
          ).rows[0],
        ).toEqual({ same: true, revision: 1 });
        await agent.get('/api/v1/auth/me').expect(200);
        expect(
          (
            await db.query(
              'SELECT count(*)::int n FROM hucescholar.password_reset_tokens WHERE user_id=$1 AND used_at IS NULL',
              [ids.STUDENT],
            )
          ).rows[0].n,
        ).toBeGreaterThan(0);
      } finally {
        await db.query(`DROP TRIGGER IF EXISTS self_service_test_failure ON hucescholar.${table}`);
        await db.query('DROP FUNCTION hucescholar.self_service_test_failure()');
      }
    },
  );
  const defaults = {
    highlightColor: '#FFF59D',
    defaultZoom: 'fit-width',
    annotationPanelOpen: false,
    reminderEmail: true,
  };
  it('preferences GET returns account-bound defaults without writing a row', async () => {
    const agent = await login();
    const result = await agent
      .get('/api/v1/account/preferences')
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(result.body).toEqual({ userId: ids.STUDENT, preferences: defaults, revision: 0 });
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM hucescholar.user_preferences WHERE user_id=$1',
          [ids.STUDENT],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it('preferences serialize concurrent revision0/revision1 writes and remain private to the session owner', async () => {
    const first = await login(),
      second = await login();
    const value = {
      ...defaults,
      highlightColor: '#CE93D8',
      defaultZoom: '150',
      annotationPanelOpen: true,
    };
    const initial = await Promise.all([
      preferences(first, { preferences: value, revision: 0 }),
      preferences(second, { preferences: defaults, revision: 0 }),
    ]);
    expect(initial.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM hucescholar.user_preferences WHERE user_id=$1',
          [ids.STUDENT],
        )
      ).rows[0].n,
    ).toBe(1);
    const updated = await Promise.all([
      preferences(first, { preferences: value, revision: 1 }),
      preferences(second, { preferences: defaults, revision: 1 }),
    ]);
    expect(updated.map((result) => result.status).sort()).toEqual([200, 409]);
    const own = await first.get('/api/v1/account/preferences').expect(200);
    expect(own.body.revision).toBe(2);
    expect(own.body.userId).toBe(ids.STUDENT);
    const admin = await login('ADMIN');
    expect((await admin.get('/api/v1/account/preferences').expect(200)).body).toEqual({
      userId: ids.ADMIN,
      preferences: defaults,
      revision: 0,
    });
    expect(
      (await preferences(admin, { preferences: value, revision: 0, userId: ids.STUDENT })).status,
    ).toBe(400);
    await admin.get(`/api/v1/account/preferences/${ids.STUDENT}`).expect(404);
    expect((await first.get('/api/v1/account/profile').expect(200)).body.user.revision).toBe(1);
  });
  it('preferences reject unknown fields/enums, incomplete bodies, invalid revisions, CSRF and locked accounts', async () => {
    const agent = await login();
    await request(app.getHttpServer()).get('/api/v1/account/preferences').expect(401);
    for (const body of [
      { preferences: { ...defaults, highlightColor: '#FF0000' }, revision: 0 },
      { preferences: { ...defaults, defaultZoom: '200' }, revision: 0 },
      { preferences: { ...defaults, annotationPanelOpen: 'false' }, revision: 0 },
      { preferences: { ...defaults, role: 'ADMIN' }, revision: 0 },
      { preferences: { highlightColor: '#FFF59D' }, revision: 0 },
      { preferences: null, revision: 0 },
      { revision: 0 },
      { preferences: defaults, revision: -1 },
      { preferences: defaults, revision: 1.5 },
    ])
      expect((await preferences(agent, body)).status).toBe(400);
    await agent
      .put('/api/v1/account/preferences')
      .set('Origin', origin)
      .send({ preferences: defaults, revision: 0 })
      .expect(403);
    expect((await preferences(agent, { preferences: defaults, revision: 1 })).status).toBe(409);
    expect((await preferences(agent, { preferences: defaults, revision: 0 })).status).toBe(200);
    await db.query('UPDATE hucescholar.user_preferences SET revision=2147483646 WHERE user_id=$1', [
      ids.STUDENT,
    ]);
    expect((await preferences(agent, { preferences: defaults, revision: 2147483646 })).status).toBe(
      409,
    );
    await db.query("UPDATE hucescholar.users SET status='LOCKED' WHERE id=$1", [ids.STUDENT]);
    expect((await preferences(agent, { preferences: defaults, revision: 1 })).status).toBe(401);
  });
});
