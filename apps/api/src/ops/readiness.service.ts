import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { DatabaseService } from '../database/database.module';
import { PrivateStore } from '../files/private-store';
import { parseAuthEnvironment } from '../auth/auth.config';

/** Redis key the file worker refreshes; readiness only reads it. */
export const WORKER_HEARTBEAT_KEY = 'hs:worker:heartbeat';
export const WORKER_HEARTBEAT_INTERVAL_MS = 15_000;
const staleAfterMs = 3 * WORKER_HEARTBEAT_INTERVAL_MS;
const checkTimeoutMs = 1_000;

type Check = { status: 'ok' | 'fail'; ms: number };
type WorkerCheck = { status: 'ok' | 'stale' | 'absent' | 'unknown'; ageSeconds: number | null };

export async function timed(run: (signal: AbortSignal) => Promise<unknown>): Promise<Check> {
  const started = Date.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      run(controller.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('timeout'));
        }, checkTimeoutMs);
      }),
    ]);
    return { status: 'ok', ms: Date.now() - started };
  } catch {
    // Never echo driver errors: they can include hosts, queries or credentials.
    return { status: 'fail', ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Database, Redis and private storage are critical: without them the API cannot authenticate,
 * read or store files. The file worker is reported separately; reading still works while it is
 * down, but uploads stay in CHECKING.
 */
@Injectable()
export class ReadinessService implements OnModuleDestroy {
  private redisClient?: Redis;
  constructor(
    private readonly db: DatabaseService,
    private readonly store: PrivateStore,
  ) {}
  /** Created on first probe so the service can be constructed without Redis configuration. */
  private get redis() {
    if (!this.redisClient) {
      this.redisClient = new Redis(parseAuthEnvironment(process.env).redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        connectTimeout: checkTimeoutMs,
        maxRetriesPerRequest: 0,
      });
      this.redisClient.on('error', () => undefined);
    }
    return this.redisClient;
  }
  onModuleDestroy() {
    this.redisClient?.disconnect();
  }
  private async connected() {
    if (this.redis.status === 'wait' || this.redis.status === 'end') await this.redis.connect();
  }
  async check() {
    const [database, redis, storage] = await Promise.all([
      timed(() => this.db.$queryRaw`SELECT 1`),
      timed(async () => {
        await this.connected();
        if ((await this.redis.ping()) !== 'PONG') throw new Error('ping');
      }),
      timed((signal) => this.store.reachable(signal)),
    ]);
    const worker = await this.worker(redis.status === 'ok');
    const critical = [database, redis, storage].every((c) => c.status === 'ok');
    return {
      status: !critical ? 'not_ready' : worker.status === 'ok' ? 'ready' : 'degraded',
      checks: { database, redis, storage, worker },
    } as const;
  }
  private async worker(redisUp: boolean): Promise<WorkerCheck> {
    if (!redisUp) return { status: 'unknown', ageSeconds: null };
    try {
      const value = await this.redis.get(WORKER_HEARTBEAT_KEY);
      const seen = value ? Number(value) : NaN;
      if (!Number.isFinite(seen)) return { status: 'absent', ageSeconds: null };
      const age = Math.max(0, Date.now() - seen);
      return { status: age <= staleAfterMs ? 'ok' : 'stale', ageSeconds: Math.round(age / 1000) };
    } catch {
      return { status: 'unknown', ageSeconds: null };
    }
  }
}
