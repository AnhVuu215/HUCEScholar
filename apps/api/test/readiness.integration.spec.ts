import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { SCANNER_STATUS_KEY, WORKER_HEARTBEAT_KEY } from '../src/ops/readiness.service';

describe('API readiness', () => {
  let app: INestApplication;
  let redis: Redis;

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? '');
    const redisUrl = new URL(process.env.TEST_REDIS_URL ?? '');
    if (!url.pathname.endsWith('_test') || redisUrl.pathname !== '/15')
      throw new Error('Isolated test services required.');
    Object.assign(process.env, {
      DATABASE_URL: url.href,
      REDIS_URL: redisUrl.href,
      APP_ORIGIN: 'http://127.0.0.1:3100',
      NODE_ENV: 'test',
    });
    redis = new Redis(redisUrl.href);
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await redis?.del(WORKER_HEARTBEAT_KEY, SCANNER_STATUS_KEY);
    await redis?.quit();
    await app?.close();
  });

  const ready = () => request(app.getHttpServer()).get('/api/v1/health/ready');

  it('checks database, Redis and storage, and reports the worker and scanner separately', async () => {
    await redis.del(WORKER_HEARTBEAT_KEY, SCANNER_STATUS_KEY);
    const degraded = await ready().expect(200).expect('Cache-Control', 'no-store');
    expect(degraded.body).toMatchObject({
      service: 'hucescholar-api',
      status: 'degraded',
      checks: {
        database: { status: 'ok' },
        redis: { status: 'ok' },
        storage: { status: 'ok' },
        worker: { status: 'absent', ageSeconds: null },
        scanner: { status: 'unknown' },
      },
    });
    expect(Object.keys(degraded.body.checks).sort()).toEqual([
      'database',
      'redis',
      'scanner',
      'storage',
      'worker',
    ]);
    await redis.set(WORKER_HEARTBEAT_KEY, String(Date.now()), 'EX', 60);
    await redis.set(SCANNER_STATUS_KEY, 'ok', 'EX', 60);
    expect((await ready().expect(200)).body.status).toBe('ready');
    await redis.set(SCANNER_STATUS_KEY, 'fail', 'EX', 60);
    const noScanner = (await ready().expect(200)).body;
    expect(noScanner.status).toBe('degraded');
    expect(noScanner.checks.scanner).toEqual({ status: 'fail' });
    await redis.set(SCANNER_STATUS_KEY, 'ok', 'EX', 60);
    await redis.set(WORKER_HEARTBEAT_KEY, String(Date.now() - 5 * 60_000), 'EX', 60);
    const stale = (await ready().expect(200)).body;
    expect(stale.status).toBe('degraded');
    expect(stale.checks.worker.status).toBe('stale');
    expect(stale.checks.worker.ageSeconds).toBeGreaterThanOrEqual(299);
  });

  it('keeps liveness unchanged, needs no session and tags every response with a request id', async () => {
    const live = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(live.body).toEqual({ status: 'ok', service: 'hucescholar-api' });
    expect(live.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const denied = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('X-Request-Id', 'probe-abcdef12')
      .expect(401);
    expect(denied.headers['x-request-id']).toBe('probe-abcdef12');
    const body = JSON.stringify((await ready()).body);
    expect(body).not.toMatch(/password|postgres:|redis:\/\/|hucescholar_test/);
  });
});
