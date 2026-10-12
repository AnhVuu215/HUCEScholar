import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';

export default async function browserSetup() {
  const env = parseEnv(readFileSync(new URL('../.local/test.env', import.meta.url), 'utf8'));
  if (
    !new URL(env.DATABASE_URL).pathname.endsWith('_test') ||
    new URL(env.REDIS_URL).pathname !== '/15'
  )
    throw new Error('Isolated test services required.');
  const Redis = createRequire(new URL('../apps/api/package.json', import.meta.url))('ioredis');
  const redis = new Redis(env.REDIS_URL);
  try {
    await redis.flushdb();
  } finally {
    await redis.quit();
  }
}
