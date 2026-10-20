import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const requireApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = requireApi('pg');
const local = process.env.CI
  ? process.env
  : parseEnv(readFileSync(new URL('../apps/api/.env', import.meta.url), 'utf8'));
const database = new URL(local.DATABASE_URL);
const redis = new URL(local.REDIS_URL);
const management = new URL(database);
management.pathname = '/postgres';
database.pathname = '/hucescholar_test';
redis.pathname = '/15';
const client = new Client({ connectionString: management.href });
await client.connect();
try {
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    'hucescholar_test',
  ]);
  if (!exists.rowCount) await client.query('CREATE DATABASE hucescholar_test');
} finally {
  await client.end();
}

const directory = new URL('../.local/', import.meta.url);
mkdirSync(directory, { recursive: true });
const csrfSecret = randomBytes(32).toString('hex');
const e2ePassword = randomBytes(24).toString('base64url');
writeFileSync(
  new URL('test.env', directory),
  [
    'NODE_ENV=test',
    'APP_ORIGIN=http://127.0.0.1:3100',
    `DATABASE_URL=${database.href}`,
    `TEST_DATABASE_URL=${database.href}`,
    `REDIS_URL=${redis.href}`,
    `TEST_REDIS_URL=${redis.href}`,
    `CSRF_SECRET=${csrfSecret}`,
    `E2E_PASSWORD=${e2ePassword}`,
    '',
  ].join('\n'),
  { mode: 0o600 },
);

const migration = spawnSync(
  process.execPath,
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  {
    cwd: fileURLToPath(new URL('../apps/api/', import.meta.url)),
    env: { ...process.env, DATABASE_URL: database.href },
    stdio: 'inherit',
  },
);
if (migration.status !== 0) process.exit(migration.status || 1);
const argon2 = requireApi('argon2');
const fixture = new Client({ connectionString: database.href });
await fixture.connect();
try {
  const hash = await argon2.hash(e2ePassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  // Keep independent browser suites below the real per-account login limit.
  const accounts = [
    ['admin', 'ADMIN'],
    ['workspace-ui-admin', 'ADMIN'],
    ['workspace-ui-lecturer', 'LECTURER'],
    ['workspace-ui-student', 'STUDENT'],
    ['ui-inventory-student', 'STUDENT'],
    ['users-admin', 'ADMIN'],
    ['catalog-admin', 'ADMIN'],
    ['assignments-admin', 'ADMIN'],
    ['drafts-admin', 'ADMIN'],
    ['drafts-lecturer', 'LECTURER'],
    ['drafts-student', 'STUDENT'],
    ['reader-admin', 'ADMIN'],
    ['reader-student', 'STUDENT'],
    ['notes-admin', 'ADMIN'],
    ['notes-student', 'STUDENT'],
    ['highlights-admin', 'ADMIN'],
    ['highlights-student', 'STUDENT'],
    ['highlights-list-admin', 'ADMIN'],
    ['highlights-list-student', 'STUDENT'],
    ['reader-v2-admin', 'ADMIN'],
    ['reader-v2-student', 'STUDENT'],
    ['catalog-v2-student', 'STUDENT'],
    ['account-v2-admin', 'ADMIN'],
    ['account-v2-lecturer', 'LECTURER'],
    ['account-v2-student', 'STUDENT'],
    ['password-admin', 'ADMIN'],
    ['password-lecturer', 'LECTURER'],
    ['password-student', 'STUDENT'],
    ['password-errors-student', 'STUDENT'],
    ['password-uncertain-student', 'STUDENT'],
    ['password-unicode-student', 'STUDENT'],
    ['preferences-admin', 'ADMIN'],
    ['preferences-student', 'STUDENT'],
    ['notebook-admin', 'ADMIN'],
    ['notebook-student', 'STUDENT'],
    ['find-admin', 'ADMIN'],
    ['find-student', 'STUDENT'],
    ['find-scan-admin', 'ADMIN'],
    ['find-scan-student', 'STUDENT'],
    ['citations-admin', 'ADMIN'],
    ['citations-student', 'STUDENT'],
    ['citations-hidden-admin', 'ADMIN'],
    ['citations-hidden-student', 'STUDENT'],
    ['reader-direct-admin', 'ADMIN'],
    ['reader-direct-student', 'STUDENT'],
    ['reader-scan-admin', 'ADMIN'],
    ['reader-scan-student', 'STUDENT'],
    ['progress-admin', 'ADMIN'],
    ['progress-student', 'STUDENT'],
    ['versions-admin', 'ADMIN'],
    ['versions-student', 'STUDENT'],
    ['personal-admin', 'ADMIN'],
    ['personal-student', 'STUDENT'],
    ['selfpublish-admin', 'ADMIN'],
    ['selfpublish-lecturer', 'LECTURER'],
    ['docx-admin', 'ADMIN'],
    ['docx-lecturer', 'LECTURER'],
    ['docx-student', 'STUDENT'],
    ['lifecycle-admin', 'ADMIN'],
    ['lifecycle-lecturer', 'LECTURER'],
    ['lifecycle-receiver', 'LECTURER'],
    ['lecturer', 'LECTURER'],
    ['student', 'STUDENT'],
  ];
  for (const [account, role] of accounts) {
    await fixture.query(
      `INSERT INTO hucescholar.users(email,display_name,password_hash,role,status,verified_at)
      VALUES($1,$2,$3,$4,'ACTIVE',now()) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,
      role=excluded.role,status='ACTIVE',verified_at=now()`,
      [`e2e-${account}@example.test`, `${role} — tài khoản kiểm thử`, hash, role],
    );
  }
} finally {
  await fixture.end();
}
console.log('Isolated test environment ready; credentials retained only in .local/test.env.');
