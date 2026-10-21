import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { RecoveryService } from '../src/auth/recovery.service';

type Browser = ReturnType<typeof request.agent>;
const origin = 'http://127.0.0.1:3100';
const password = randomBytes(24).toString('base64url');
const newPassword = `${randomBytes(18).toString('base64url')}Mới`;
const prefix = `recovery-${randomBytes(4).toString('hex')}`;
const generic = {
  message:
    'Nếu email thuộc một tài khoản đang hoạt động, thư hướng dẫn sẽ đến trong vài phút. Liên kết hết hạn sau 30 phút.',
};

describe('account recovery by email (AUTH-03)', () => {
  let app: INestApplication;
  let db: Client;
  let redis: Redis;
  let outbox: string;
  const ids: Record<string, string> = {};
  const email = (name: string) => `${prefix}-${name}@example.test`;

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? '');
    const redisUrl = new URL(process.env.TEST_REDIS_URL ?? '');
    if (!url.pathname.endsWith('_test') || redisUrl.pathname !== '/15')
      throw new Error('Isolated test services required.');
    outbox = await mkdtemp(join(tmpdir(), 'hs-mail-'));
    Object.assign(process.env, {
      DATABASE_URL: url.href,
      REDIS_URL: redisUrl.href,
      APP_ORIGIN: origin,
      NODE_ENV: 'test',
      MAIL_TRANSPORT: 'file',
      MAIL_DIR: outbox,
    });
    db = new Client({ connectionString: url.href });
    await db.connect();
    redis = new Redis(redisUrl.href);
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    for (const [name, status] of [
      ['active', 'ACTIVE'],
      ['locked', 'LOCKED'],
    ]) {
      const result = await db.query(
        "INSERT INTO hucescholar.users(email,display_name,password_hash,role,status,verified_at) VALUES($1,$2,$3,'STUDENT',$4,now()) RETURNING id",
        [email(name), `Người dùng ${name}`, hash, status],
      );
      ids[name] = result.rows[0].id;
    }
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    configureApplication(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    await redis.flushdb();
  });
  afterAll(async () => {
    await app?.close();
    for (const key of ['MAIL_TRANSPORT', 'MAIL_DIR']) delete process.env[key];
    if (db) {
      const all = Object.values(ids);
      await db.query('DELETE FROM hucescholar.auth_sessions WHERE user_id=ANY($1::bigint[])', [
        all,
      ]);
      await db.query(
        'DELETE FROM hucescholar.password_reset_tokens WHERE user_id=ANY($1::bigint[])',
        [all],
      );
      await db.query('DELETE FROM hucescholar.audit_events WHERE actor_id=ANY($1::bigint[])', [
        all,
      ]);
      await db.query('DELETE FROM hucescholar.users WHERE id=ANY($1::bigint[])', [all]);
      await db.end();
    }
    await redis?.quit();
    await rm(outbox, { recursive: true, force: true });
  });

  async function csrf(agent: Browser) {
    return (await agent.get('/api/v1/auth/csrf').expect(200)).body.csrfToken as string;
  }
  async function post(agent: Browser, path: string, body: object) {
    // The CSRF cookie must be in the jar before the request is built.
    const token = await csrf(agent);
    return agent
      .post(`/api/v1/auth/${path}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send(body);
  }
  /** Waits for deliveries started after the 202 and returns the mails sent to an address. */
  async function mails(to: string) {
    await Promise.all([...app.get(RecoveryService).pending]);
    const files = (await readdir(outbox)).sort();
    const all = await Promise.all(
      files.map(async (f) => JSON.parse(await readFile(join(outbox, f), 'utf8'))),
    );
    return all.filter((m: { to: string }) => m.to === to) as { subject: string; text: string }[];
  }
  const tokenOf = (text: string) => /#token=([A-Za-z0-9_-]{43})/.exec(text)?.[1] ?? '';

  it('answers the same for unknown and locked accounts and sends nothing', async () => {
    const browser = request.agent(app.getHttpServer());
    for (const address of [email('missing'), email('locked')]) {
      const response = await post(browser, 'password-recovery', { email: address });
      expect(response.status).toBe(202);
      expect(response.body).toEqual(generic);
    }
    expect(await mails(email('missing'))).toEqual([]);
    expect(await mails(email('locked'))).toEqual([]);
    await browser
      .post('/api/v1/auth/password-recovery')
      .send({ email: email('active') })
      .expect(403);
  });

  it('resets once with the newest link, revokes sessions and rejects reuse or expiry', async () => {
    const signedIn = request.agent(app.getHttpServer());
    expect((await post(signedIn, 'login', { email: email('active'), password })).status).toBe(200);
    const browser = request.agent(app.getHttpServer());
    expect(
      (await post(browser, 'password-recovery', { email: email('ACTIVE').toUpperCase() })).body,
    ).toEqual(generic);
    expect((await post(browser, 'password-recovery', { email: email('active') })).status).toBe(202);
    const sent = await mails(email('active'));
    expect(sent).toHaveLength(2);
    expect(sent[0].subject).toBe('Đặt lại mật khẩu HUCEScholar');
    expect(sent[1].text).toContain(`${origin}/reset-password#token=`);
    const [older, newest] = sent.map((m) => tokenOf(m.text));
    // Only the hash is stored.
    const stored = await db.query(
      'SELECT token_hash FROM hucescholar.password_reset_tokens WHERE user_id=$1',
      [ids.active],
    );
    expect(stored.rows.map((r: { token_hash: string }) => r.token_hash)).not.toContain(newest);
    const complete = (token: string, value = newPassword) =>
      post(browser, 'password-recovery/complete', { token, newPassword: value });
    expect((await complete(older)).body.code).toBe('RESET_TOKEN_INVALID');
    expect((await complete(newest, 'quá ngắn')).status).toBe(400);
    expect((await complete(newest)).status).toBe(204);
    await signedIn.get('/api/v1/auth/me').expect(401);
    expect((await post(browser, 'login', { email: email('active'), password })).status).toBe(401);
    await redis.flushdb();
    expect(
      (await post(browser, 'login', { email: email('active'), password: newPassword })).status,
    ).toBe(200);
    expect((await complete(newest)).body.code).toBe('RESET_TOKEN_INVALID');
    const events = await db.query(
      "SELECT event_type FROM hucescholar.audit_events WHERE actor_id=$1 AND event_type LIKE 'ACCOUNT_%' ORDER BY id",
      [ids.active],
    );
    expect(events.rows.map((r: { event_type: string }) => r.event_type)).toEqual([
      'ACCOUNT_RECOVERY_REQUESTED',
      'ACCOUNT_RECOVERY_REQUESTED',
      'ACCOUNT_PASSWORD_RESET',
    ]);
    // An expired link is refused like an unknown one.
    await redis.flushdb();
    await post(browser, 'password-recovery', { email: email('active') });
    const expired = tokenOf((await mails(email('active'))).at(-1)!.text);
    await db.query(
      "UPDATE hucescholar.password_reset_tokens SET expires_at=now() - interval '1 minute', created_at=now() - interval '31 minutes' WHERE user_id=$1 AND used_at IS NULL",
      [ids.active],
    );
    expect((await complete(expired)).body.code).toBe('RESET_TOKEN_INVALID');
    expect((await complete('not-a-token')).body.code).toBe('RESET_TOKEN_INVALID');
  });

  it('limits requests per address', async () => {
    const browser = request.agent(app.getHttpServer());
    const statuses = [];
    for (let i = 0; i < 6; i++)
      statuses.push((await post(browser, 'password-recovery', { email: email('missing') })).status);
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429]);
  });
});
