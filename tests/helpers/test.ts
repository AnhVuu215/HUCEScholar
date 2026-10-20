import { test as base } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';

export * from '@playwright/test';

interface Redis {
  scan(cursor: string, ...args: (string | number)[]): Promise<[string, string[]]>;
  del(...keys: string[]): Promise<number>;
  quit(): Promise<unknown>;
}

// Every browser suite logs in from 127.0.0.1, so the full run exceeds the real
// per-IP login quota on fast runners. Reset only the IP counters in the isolated
// test Redis before each test; per-email limits and the API limiter stay as-is.
export const test = base.extend<object, { loginQuota: Redis }>({
  loginQuota: [
    async ({}, use) => {
      const env = parseEnv(readFileSync(`${__dirname}/../../.local/test.env`, 'utf8'));
      if (new URL(env.REDIS_URL!).pathname !== '/15')
        throw new Error('Isolated test Redis required.');
      const Redis = createRequire(`${__dirname}/../../apps/api/package.json`)('ioredis');
      const redis: Redis = new Redis(env.REDIS_URL);
      await use(redis);
      await redis.quit();
    },
    { scope: 'worker' },
  ],
  page: async ({ page, loginQuota }, use) => {
    let cursor = '0';
    do {
      const [next, keys] = await loginQuota.scan(cursor, 'MATCH', 'hs:login:ip:*', 'COUNT', 100);
      if (keys.length) await loginQuota.del(...keys);
      cursor = next;
    } while (cursor !== '0');
    await use(page);
  },
});
