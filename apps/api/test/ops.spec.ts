import 'reflect-metadata';
import { ConsoleLogger, Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { currentRequestId, requestContext } from '../src/ops/request-context';
import { ReadinessService, timed, WORKER_HEARTBEAT_KEY } from '../src/ops/readiness.service';
import { SafeLogger } from '../src/safe-logger';
import type { DatabaseService } from '../src/database/database.module';
import type { PrivateStore } from '../src/files/private-store';

@Controller()
class EchoController {
  @Get('echo') echo() {
    return { requestId: currentRequestId() };
  }
  @Get('health') health() {
    return {};
  }
}

describe('request context', () => {
  let app: INestApplication;
  const lines: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [EchoController] }).compile();
    app = module.createNestApplication();
    app.use(requestContext((line) => lines.push(line)));
    app.setGlobalPrefix('api/v1');
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('generates an id, keeps a sane upstream id and replaces an unsafe one', async () => {
    const generated = await request(app.getHttpServer()).get('/api/v1/echo').expect(200);
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(generated.body.requestId).toBe(generated.headers['x-request-id']);
    const kept = await request(app.getHttpServer())
      .get('/api/v1/echo')
      .set('X-Request-Id', 'edge-1234abcd')
      .expect(200);
    expect(kept.headers['x-request-id']).toBe('edge-1234abcd');
    expect(kept.body.requestId).toBe('edge-1234abcd');
    for (const unsafe of ['short', 'a'.repeat(65), 'bad id with spaces', 'x\r\ninjected']) {
      const replaced = await request(app.getHttpServer())
        .get('/api/v1/echo')
        .set('X-Request-Id', unsafe.replace(/[\r\n]/g, ''))
        .expect(200);
      expect(replaced.headers['x-request-id']).not.toBe(unsafe);
    }
  });

  it('logs method, path without query, status and id only, and skips health probes', async () => {
    lines.length = 0;
    const response = await request(app.getHttpServer())
      .get('/api/v1/echo?search=ghi%20ch%C3%BA%20ri%C3%AAng')
      .set('Cookie', 'hs_session=secret-token')
      .expect(200);
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      new RegExp(`^GET /api/v1/echo 200 \\d+ms id=${response.headers['x-request-id']}$`),
    );
    expect(lines[0]).not.toMatch(/search|secret|hs_session/);
  });

  it('adds the current request id to the generic error line', () => {
    const parent = jest.spyOn(ConsoleLogger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const logger = new SafeLogger();
      requestContext()(
        { get: () => 'trace-12345678' } as never,
        { setHeader: () => undefined } as never,
        () => (logger.error as (message: string) => void)('SELECT secret FROM users'),
      );
      const message = String(parent.mock.calls[0][0]);
      expect(message).toContain('(request trace-12345678)');
      expect(message).not.toContain('SELECT');
    } finally {
      parent.mockRestore();
    }
  });
});

describe('readiness', () => {
  const ok = {
    $queryRaw: () => Promise.resolve([{ '?column?': 1 }]),
  } as unknown as DatabaseService;
  const store = { reachable: () => Promise.resolve() } as unknown as PrivateStore;
  function service(
    db: DatabaseService,
    files: PrivateStore,
    heartbeat: string | null,
    ping = 'PONG',
  ) {
    const readiness = new ReadinessService(db, files);
    const keys = new Map<string, string | null>([[WORKER_HEARTBEAT_KEY, heartbeat]]);
    Object.assign(readiness, {
      redisClient: {
        status: 'ready',
        ping: () => (ping === 'fail' ? Promise.reject(new Error('down')) : Promise.resolve(ping)),
        get: (key: string) => Promise.resolve(keys.get(key) ?? null),
        disconnect: () => undefined,
      },
    });
    return readiness;
  }

  it('is ready with a fresh worker heartbeat and degraded without one', async () => {
    expect((await service(ok, store, String(Date.now())).check()).status).toBe('ready');
    const absent = await service(ok, store, null).check();
    expect(absent.status).toBe('degraded');
    expect(absent.checks.worker).toEqual({ status: 'absent', ageSeconds: null });
    const stale = await service(ok, store, String(Date.now() - 120_000)).check();
    expect(stale.checks.worker.status).toBe('stale');
    expect(stale.status).toBe('degraded');
  });

  it('is not ready when a critical dependency fails, without exposing the error', async () => {
    const broken = {
      $queryRaw: () => Promise.reject(new Error('password=hunter2 host=db')),
    } as unknown as DatabaseService;
    const result = await service(broken, store, String(Date.now())).check();
    expect(result.status).toBe('not_ready');
    expect(result.checks.database.status).toBe('fail');
    expect(JSON.stringify(result)).not.toMatch(/hunter2|host=/);
    const noRedis = await service(ok, store, String(Date.now()), 'fail').check();
    expect(noRedis.status).toBe('not_ready');
    expect(noRedis.checks.worker.status).toBe('unknown');
  });

  it('times out a hanging check after about one second', async () => {
    const started = Date.now();
    const result = await timed(() => new Promise(() => undefined));
    expect(result.status).toBe('fail');
    expect(Date.now() - started).toBeLessThan(1_500);
  });
});
