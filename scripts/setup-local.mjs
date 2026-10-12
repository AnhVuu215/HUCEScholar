import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const infraPath = new URL('../infra/.env', import.meta.url);
if (!existsSync(infraPath)) {
  writeFileSync(
    infraPath,
    [
      `POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}`,
      `REDIS_PASSWORD=${randomBytes(32).toString('hex')}`,
      'POSTGRES_PORT=55432',
      'REDIS_PORT=56379',
      '',
    ].join('\n'),
    { mode: 0o600, flag: 'wx' },
  );
}
const infra = parseEnv(readFileSync(infraPath, 'utf8'));
if (!infra.POSTGRES_PASSWORD || !infra.REDIS_PASSWORD) {
  throw new Error('Set both local infrastructure passwords before setup.');
}
const apiPath = new URL('../apps/api/.env', import.meta.url);
if (!existsSync(apiPath)) {
  writeFileSync(
    apiPath,
    [
      'NODE_ENV=development',
      'HOST=127.0.0.1',
      'PORT=3001',
      'APP_ORIGIN=http://127.0.0.1:3000',
      `DATABASE_URL=postgresql://hucescholar:${encodeURIComponent(infra.POSTGRES_PASSWORD)}@127.0.0.1:${infra.POSTGRES_PORT || '5432'}/hucescholar`,
      `REDIS_URL=redis://:${encodeURIComponent(infra.REDIS_PASSWORD)}@127.0.0.1:${infra.REDIS_PORT || '6379'}/0`,
      `CSRF_SECRET=${randomBytes(32).toString('hex')}`,
      '',
    ].join('\n'),
    { mode: 0o600, flag: 'wx' },
  );
}
console.log('Local environment ready. Existing files retained; no secrets printed.');
