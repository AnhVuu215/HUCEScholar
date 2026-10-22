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
import { SignupService } from '../src/auth/signup.service';

type Browser = ReturnType<typeof request.agent>;
const origin = 'http://127.0.0.1:3100';
const password = `${randomBytes(18).toString('base64url')}Mới`;
const prefix = `signup-${randomBytes(4).toString('hex')}`;
const generic = {
  message:
    'Đã nhận yêu cầu. Thư xác nhận sẽ đến email này trong vài phút; liên kết hết hạn sau 24 giờ.',
};

describe('self-service sign-up confirmed by email (AUTH-04)', () => {
  let app: INestApplication;
  let db: Client;
  let redis: Redis;
  let outbox: string;
  const email = (name: string) => `${prefix}-${name}@example.test`;

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? '');
    const redisUrl = new URL(process.env.TEST_REDIS_URL ?? '');
    if (!url.pathname.endsWith('_test') || redisUrl.pathname !== '/15')
      throw new Error('Isolated test services required.');
    outbox = await mkdtemp(join(tmpdir(), 'hs-signup-mail-'));
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
    ])
      await db.query(
        "INSERT INTO hucescholar.users(email,display_name,password_hash,role,status,verified_at) VALUES($1,$2,$3,'STUDENT',$4,now())",
        [email(name), `Người dùng ${name}`, hash, status],
      );
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
      const like = `${prefix}-%`;
      await db.query('DELETE FROM hucescholar.signup_tokens WHERE email LIKE $1', [like]);
      const users = '(SELECT id FROM hucescholar.users WHERE email LIKE $1)';
      await db.query(`DELETE FROM hucescholar.auth_sessions WHERE user_id IN ${users}`, [like]);
      await db.query(`DELETE FROM hucescholar.audit_events WHERE actor_id IN ${users}`, [like]);
      await db.query('DELETE FROM hucescholar.users WHERE email LIKE $1', [like]);
      await db.end();
    }
    await redis?.quit();
    await rm(outbox, { recursive: true, force: true });
  });

  async function post(agent: Browser, path: string, body: object) {
    // The CSRF cookie must be in the jar before the request is built.
    const token = (await agent.get('/api/v1/auth/csrf').expect(200)).body.csrfToken as string;
    return agent
      .post(`/api/v1/auth/${path}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send(body);
  }
  /** Waits for deliveries started after the 202 and returns the mails sent to an address. */
  async function mails(to: string) {
    await Promise.all([...app.get(SignupService).pending]);
    const files = (await readdir(outbox)).sort();
    const all = await Promise.all(
      files.map(async (f) => JSON.parse(await readFile(join(outbox, f), 'utf8'))),
    );
    return all.filter((m: { to: string }) => m.to === to) as { subject: string; text: string }[];
  }
  const tokenOf = (text: string) => /#token=([A-Za-z0-9_-]{43})/.exec(text)?.[1] ?? '';
  const complete = (agent: Browser, token: string, overrides: object = {}) =>
    post(agent, 'signup/complete', {
      token,
      displayName: 'Sinh viên tự đăng ký',
      role: 'STUDENT',
      password,
      ...overrides,
    });

  it('creates an account only from the newest mailed link, never as admin', async () => {
    const browser = request.agent(app.getHttpServer());
    await browser
      .post('/api/v1/auth/signup')
      .send({ email: email('new') })
      .expect(403);
    const first = await post(browser, 'signup', { email: email('NEW').toUpperCase() });
    expect(first.status).toBe(202);
    expect(first.body).toEqual(generic);
    // Let the first delivery finish so the mail order matches the link order.
    expect(await mails(email('new'))).toHaveLength(1);
    expect((await post(browser, 'signup', { email: email('new') })).status).toBe(202);
    // No account exists until the link is used.
    expect(
      (await db.query('SELECT 1 FROM hucescholar.users WHERE email=$1', [email('new')])).rowCount,
    ).toBe(0);
    const sent = await mails(email('new'));
    expect(sent).toHaveLength(2);
    expect(sent[0].subject).toBe('Xác nhận đăng ký HUCEScholar');
    expect(sent[1].text).toContain(`${origin}/signup/complete#token=`);
    const [older, newest] = sent.map((m) => tokenOf(m.text));
    // Overlapping requests for one address still leave a single usable link.
    await Promise.all([1, 2].map(() => post(browser, 'signup', { email: email('pair') })));
    expect(await mails(email('pair'))).toHaveLength(2);
    expect(
      (
        await db.query(
          'SELECT 1 FROM hucescholar.signup_tokens WHERE email=$1 AND used_at IS NULL',
          [email('pair')],
        )
      ).rowCount,
    ).toBe(1);
    const stored = await db.query(
      'SELECT token_hash FROM hucescholar.signup_tokens WHERE email=$1',
      [email('new')],
    );
    expect(stored.rows.map((r: { token_hash: string }) => r.token_hash)).not.toContain(newest);
    expect((await complete(browser, older)).body.code).toBe('SIGNUP_TOKEN_INVALID');
    for (const body of [
      { role: 'ADMIN' },
      { role: 'student' },
      { password: 'quá ngắn' },
      { displayName: '   ' },
      { displayName: 'x'.repeat(151) },
    ])
      expect((await complete(browser, newest, body)).status).toBe(400);
    expect((await complete(browser, newest)).status).toBe(204);
    expect((await complete(browser, newest)).body.code).toBe('SIGNUP_TOKEN_INVALID');
    const account = await db.query(
      'SELECT id, role, status, verified_at, verified_by, must_change_password FROM hucescholar.users WHERE email=$1',
      [email('new')],
    );
    expect(account.rows[0]).toMatchObject({
      role: 'STUDENT',
      status: 'ACTIVE',
      verified_by: null,
      must_change_password: false,
    });
    expect(account.rows[0].verified_at).not.toBeNull();
    const audit = await db.query(
      'SELECT event_type FROM hucescholar.audit_events WHERE actor_id=$1',
      [account.rows[0].id],
    );
    expect(audit.rows).toEqual([{ event_type: 'ACCOUNT_SELF_REGISTERED' }]);
    const login = await post(browser, 'login', { email: email('new'), password });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ role: 'STUDENT', displayName: 'Sinh viên tự đăng ký' });
  });

  it('registers a lecturer and refuses a link once the address has an account', async () => {
    const browser = request.agent(app.getHttpServer());
    await post(browser, 'signup', { email: email('lecturer') });
    const token = tokenOf((await mails(email('lecturer')))[0].text);
    expect((await complete(browser, token, { role: 'LECTURER' })).status).toBe(204);
    const login = await post(browser, 'login', { email: email('lecturer'), password });
    expect(login.body.user.role).toBe('LECTURER');

    // An admin issues the account while the link is still open: the link no longer creates one.
    await post(browser, 'signup', { email: email('raced') });
    const raced = tokenOf((await mails(email('raced')))[0].text);
    await db.query(
      "INSERT INTO hucescholar.users(email,display_name,password_hash,role,status,verified_at) VALUES($1,'Cấp bởi admin','x','STUDENT','ACTIVE',now())",
      [email('raced')],
    );
    const refused = await complete(browser, raced);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('SIGNUP_EMAIL_TAKEN');

    // An expired or malformed link is refused like an unknown one.
    await post(browser, 'signup', { email: email('late') });
    const late = tokenOf((await mails(email('late')))[0].text);
    await db.query(
      "UPDATE hucescholar.signup_tokens SET expires_at=now() - interval '1 minute', created_at=now() - interval '25 hours' WHERE email=$1",
      [email('late')],
    );
    expect((await complete(browser, late)).body.code).toBe('SIGNUP_TOKEN_INVALID');
    expect((await complete(browser, 'not-a-token')).body.code).toBe('SIGNUP_TOKEN_INVALID');
  });

  it('answers the same for registered addresses without making a link', async () => {
    const browser = request.agent(app.getHttpServer());
    for (const name of ['active', 'locked']) {
      const response = await post(browser, 'signup', { email: email(name) });
      expect(response.status).toBe(202);
      expect(response.body).toEqual(generic);
    }
    const active = await mails(email('active'));
    expect(active.map((m) => m.subject)).toEqual(['Bạn đã có tài khoản HUCEScholar']);
    expect(tokenOf(active[0].text)).toBe('');
    expect(await mails(email('locked'))).toEqual([]);
    expect(
      (
        await db.query('SELECT 1 FROM hucescholar.signup_tokens WHERE email = ANY($1)', [
          [email('active'), email('locked')],
        ])
      ).rowCount,
    ).toBe(0);
  });

  it('limits requests per address', async () => {
    const browser = request.agent(app.getHttpServer());
    const statuses = [];
    for (let i = 0; i < 6; i++)
      statuses.push((await post(browser, 'signup', { email: email('flood') })).status);
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429]);
  });
});
