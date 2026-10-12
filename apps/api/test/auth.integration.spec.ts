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
const credentialError = {
  statusCode: 401,
  message: 'Email hoặc mật khẩu không đúng.',
  error: 'Unauthorized',
};

describe('database-backed browser sessions', () => {
  let app: INestApplication;
  let db: Client;
  let redis: Redis;
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
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    for (const role of ['ADMIN', 'LECTURER', 'STUDENT']) {
      const result = await db.query(
        "INSERT INTO hucescholar.users(email,display_name,password_hash,role,status,verified_at) VALUES($1,$2,$3,$4,'ACTIVE',now()) RETURNING id",
        [`integration-${role.toLowerCase()}@example.test`, `${role} test`, hash, role],
      );
      ids[role] = result.rows[0].id;
    }
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM hucescholar.auth_sessions WHERE user_id=ANY($1::bigint[])', [
      Object.values(ids),
    ]);
    for (const [role, id] of Object.entries(ids)) {
      await db.query(
        "UPDATE hucescholar.users SET role=$1,status='ACTIVE',verified_at=coalesce(verified_at,now()) WHERE id=$2",
        [role, id],
      );
    }
    // This Redis database is exclusively reserved for the isolated HUCEScholar test environment.
    await redis.flushdb();
  });

  afterAll(async () => {
    await app?.close();
    if (db) {
      await db.query('DELETE FROM hucescholar.auth_sessions WHERE user_id=ANY($1::bigint[])', [
        Object.values(ids),
      ]);
      await db.query('DELETE FROM hucescholar.users WHERE id=ANY($1::bigint[])', [
        Object.values(ids),
      ]);
      await db.end();
    }
    await redis?.quit();
  });

  async function csrf(agent: Browser): Promise<string> {
    const response = await agent
      .get('/api/v1/auth/csrf')
      .expect(200)
      .expect('Cache-Control', 'no-store');
    return response.body.csrfToken;
  }

  async function login(agent: Browser, role = 'STUDENT', suppliedPassword = password) {
    const token = await csrf(agent);
    return agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({
        email: `integration-${role.toLowerCase()}@example.test`,
        password: suppliedPassword,
      });
  }

  it.each(['ADMIN', 'LECTURER', 'STUDENT'])(
    'logs in %s and returns string ID with safe HttpOnly cookie',
    async (role) => {
      const browser = request.agent(app.getHttpServer());
      const response = await login(browser, role);
      expect(response.status).toBe(200);
      expect(response.body.user.role).toBe(role);
      expect(typeof response.body.user.id).toBe('string');
      expect(JSON.stringify(response.body).includes('password')).toBe(false);
      const cookie =
        (response.headers['set-cookie'] as unknown as string[]).find((value) =>
          value.startsWith('hs_session='),
        ) ?? '';
      expect(cookie.includes('HttpOnly')).toBe(true);
      expect(cookie.includes('SameSite=Lax')).toBe(true);
      const rawToken = cookie.split(';')[0].split('=')[1];
      const stored = await db.query(
        'SELECT token_hash FROM hucescholar.auth_sessions WHERE user_id=$1',
        [ids[role]],
      );
      expect(stored.rows[0].token_hash === rawToken).toBe(false);
      expect(stored.rows[0].token_hash.length).toBe(64);
      const me = await browser
        .get('/api/v1/auth/me')
        .expect(200)
        .expect('Cache-Control', 'no-store');
      expect(me.body.user.id).toBe(ids[role]);
      await browser
        .get(`/api/v1/workspace/${role.toLowerCase()}`)
        .expect(200)
        .expect('Cache-Control', 'no-store');
    },
  );

  it('normalizes email without changing the password', async () => {
    const browser = request.agent(app.getHttpServer());
    const token = await csrf(browser);
    await browser
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({ email: ' INTEGRATION-STUDENT@EXAMPLE.TEST ', password })
      .expect(200);
  });

  it('prevents caching through differently cased route aliases and denials', async () => {
    const browser = request.agent(app.getHttpServer());
    expect((await login(browser)).status).toBe(200);
    await browser.get('/api/v1/AUTH/me').expect(200).expect('Cache-Control', 'no-store');
    await request(app.getHttpServer())
      .get('/API/v1/auth/me')
      .expect(401)
      .expect('Cache-Control', 'no-store');
  });
  it('prevents caching even when JSON parsing fails before route guards', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400)
      .expect('Cache-Control', 'no-store');
  });

  it.each(['wrong', 'unknown', 'LOCKED', 'PENDING'])(
    'does not disclose account state for %s credentials',
    async (condition) => {
      if (condition === 'LOCKED' || condition === 'PENDING') {
        await db.query('UPDATE hucescholar.users SET status=$1 WHERE id=$2', [
          condition,
          ids.STUDENT,
        ]);
      }
      const browser = request.agent(app.getHttpServer());
      const token = await csrf(browser);
      const response = await browser
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .send({
          email:
            condition === 'unknown' ? 'absent@example.test' : 'integration-student@example.test',
          password: condition === 'wrong' ? randomBytes(24).toString('hex') : password,
        });
      expect(response.status).toBe(401);
      expect(response.body).toEqual(credentialError);
    },
  );

  it('requires session and exact role; rejects malformed cookie', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', 'hs_session=malformed')
      .expect(401);
    const browser = request.agent(app.getHttpServer());
    expect((await login(browser)).status).toBe(200);
    await browser.get('/api/v1/workspace/admin').expect(403);
    await browser.get('/api/v1/workspace/lecturer').expect(403);
  });

  it.each(['csrf', 'origin', 'foreign-seed'])(
    'rejects missing or forged %s before login',
    async (condition) => {
      const browser = request.agent(app.getHttpServer());
      const token = await csrf(
        condition === 'foreign-seed' ? request.agent(app.getHttpServer()) : browser,
      );
      const operation = browser
        .post('/api/v1/auth/login')
        .set('Origin', condition === 'origin' ? 'https://attacker.example.test' : origin);
      if (condition !== 'csrf') operation.set('X-CSRF-Token', token);
      await operation.send({ email: 'integration-student@example.test', password }).expect(403);
      const count = await db.query(
        'SELECT count(*)::int n FROM hucescholar.auth_sessions WHERE user_id=$1',
        [ids.STUDENT],
      );
      expect(count.rows[0].n).toBe(0);
    },
  );

  it('requires fresh session-bound CSRF, logs out and permanently revokes the token', async () => {
    const browser = request.agent(app.getHttpServer());
    const oldCsrf = await csrf(browser);
    const response = await browser
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', oldCsrf)
      .send({ email: 'integration-student@example.test', password })
      .expect(200);
    const cookie = (response.headers['set-cookie'] as unknown as string[])
      .find((value) => value.startsWith('hs_session='))!
      .split(';')[0];
    await browser
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', oldCsrf)
      .expect(403);
    const token = await csrf(browser);
    await browser
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .expect(204);
    await browser.get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
  });

  it.each(['expired', 'revoked', 'LOCKED', 'unverified'])(
    'rejects %s sessions on the next request',
    async (condition) => {
      const browser = request.agent(app.getHttpServer());
      expect((await login(browser)).status).toBe(200);
      if (condition === 'expired')
        await db.query(
          "UPDATE hucescholar.auth_sessions SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE user_id=$1",
          [ids.STUDENT],
        );
      if (condition === 'revoked')
        await db.query('UPDATE hucescholar.auth_sessions SET revoked_at=now() WHERE user_id=$1', [
          ids.STUDENT,
        ]);
      if (condition === 'LOCKED')
        await db.query("UPDATE hucescholar.users SET status='LOCKED' WHERE id=$1", [ids.STUDENT]);
      if (condition === 'unverified')
        await db.query(
          "UPDATE hucescholar.users SET status='PENDING',verified_at=NULL WHERE id=$1",
          [ids.STUDENT],
        );
      await browser.get('/api/v1/auth/me').expect(401);
    },
  );

  it('limits repeated login attempts with Redis', async () => {
    const browser = request.agent(app.getHttpServer());
    for (let attempt = 0; attempt < 10; attempt++)
      expect((await login(browser, 'STUDENT', 'incorrect-password')).status).toBe(401);
    expect((await login(browser)).status).toBe(429);
  });

  it('rejects additional body fields and never exposes signup', async () => {
    const browser = request.agent(app.getHttpServer());
    const token = await csrf(browser);
    await browser
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({ email: 'integration-student@example.test', password, role: 'ADMIN' })
      .expect(400);
    await browser
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({})
      .expect(404);
  });
});
