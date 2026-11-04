// Writes random credentials for the OPS-02 rehearsal into the ignored infra/.env.rehearsal.
// Never overwrites an existing file: the volumes keep the passwords they were created with.
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../infra/.env.rehearsal', import.meta.url));
if (existsSync(target)) {
  console.log('infra/.env.rehearsal already exists; left unchanged.');
} else {
  const secret = (bytes = 24) => randomBytes(bytes).toString('hex');
  const lines = [
    `POSTGRES_PASSWORD=${secret()}`,
    `REDIS_PASSWORD=${secret()}`,
    `CSRF_SECRET=${secret(32)}`,
    `GARAGE_RPC_SECRET=${secret(32)}`,
    `S3_APP_KEY_ID=GK${secret(12)}`,
    `S3_APP_SECRET=${secret(32)}`,
  ];
  writeFileSync(target, `${lines.join('\n')}\n`, { mode: 0o600, flag: 'wx' });
  console.log('Wrote infra/.env.rehearsal.');
}
