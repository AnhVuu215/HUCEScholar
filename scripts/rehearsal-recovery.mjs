// OPS-02 recovery drill. `backup` saves the database then every object, with a manifest of hashes
// and catalog counts. `wipe` destroys the rehearsal's own Postgres and Garage volumes. `restore`
// rebuilds both from a backup and compares them with the manifest. The database goes first: objects
// are immutable, so anything the dump names is already in the store when the copy starts.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(`${root}apps/api/package.json`);
const { Client } = require('pg');
const {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');

const envFile = `${root}infra/.env.rehearsal`;
const composeFile = `${root}infra/compose.rehearsal.yaml`;
const backups = `${root}.local/rehearsal-backups`;
const Bucket = 'hucescholar-private';
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);
const compose = (args, options = {}) =>
  execFileSync('docker', ['compose', '--env-file', envFile, '-f', composeFile, ...args], {
    maxBuffer: 1024 * 1024 * 1024,
    ...options,
  });
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const s3 = () =>
  new S3Client({
    region: 'garage',
    endpoint: 'http://127.0.0.1:53900',
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_APP_KEY_ID, secretAccessKey: env.S3_APP_SECRET },
  });

async function listKeys(client) {
  const keys = [];
  let ContinuationToken;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket, ContinuationToken }));
    keys.push(...(page.Contents ?? []).map((item) => item.Key));
    ContinuationToken = page.NextContinuationToken;
  } while (ContinuationToken);
  return keys.sort();
}

/** What must survive: Prisma cannot recreate partial indexes, triggers or CHECK constraints. */
async function catalog() {
  const db = new Client({
    connectionString: `postgresql://hucescholar:${env.POSTGRES_PASSWORD}@127.0.0.1:55532/hucescholar`,
  });
  await db.connect();
  try {
    const count = async (sql) => Number((await db.query(sql)).rows[0].count);
    const schema = `(SELECT oid FROM pg_namespace WHERE nspname = 'hucescholar')`;
    const tables = (
      await db.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'hucescholar' ORDER BY tablename`,
      )
    ).rows.map((row) => row.tablename);
    const rows = {};
    for (const table of tables)
      rows[table] = await count(`SELECT count(*) FROM hucescholar."${table}"`);
    return {
      constraints: await count(`SELECT count(*) FROM pg_constraint WHERE connamespace = ${schema}`),
      indexes: await count(`SELECT count(*) FROM pg_indexes WHERE schemaname = 'hucescholar'`),
      partialIndexes: await count(
        `SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
         WHERE c.relnamespace = ${schema} AND i.indpred IS NOT NULL`,
      ),
      triggers: await count(
        `SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         WHERE c.relnamespace = ${schema} AND NOT t.tgisinternal`,
      ),
      rows,
    };
  } finally {
    await db.end();
  }
}

async function backup() {
  const target = join(backups, new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(target, { recursive: true, mode: 0o700 });
  const dump = compose([
    'exec',
    '-T',
    'postgres',
    'pg_dump',
    '-U',
    'hucescholar',
    '-Fc',
    'hucescholar',
  ]);
  writeFileSync(join(target, 'database.dump'), dump, { mode: 0o600 });
  const client = s3();
  const objects = {};
  for (const key of await listKeys(client)) {
    const object = await client.send(new GetObjectCommand({ Bucket, Key: key }));
    const bytes = Buffer.from(await object.Body.transformToByteArray());
    const path = join(target, 'objects', key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes, { mode: 0o600 });
    objects[key] = { sha256: sha256(bytes), contentType: object.ContentType };
  }
  client.destroy();
  const manifest = { database: sha256(dump), objects, catalog: await catalog() };
  writeFileSync(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(
    `Backup ${target}: ${dump.length} database bytes, ${Object.keys(objects).length} objects.`,
  );
}

function wipe() {
  compose(['rm', '-sf', 'api', 'file-worker', 'postgres', 'garage'], { stdio: 'ignore' });
  for (const volume of ['postgres_data', 'garage_meta', 'garage_data'])
    execFileSync('docker', ['volume', 'rm', `hucescholar-rehearsal_${volume}`], {
      stdio: 'ignore',
    });
  console.log('Rehearsal database and object store destroyed.');
}

async function waitFor(check, label) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if (await check()) return;
    } catch {
      // Still starting.
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`${label} did not start.`);
}

async function restore() {
  const name = process.argv[3] ?? readdirSync(backups).sort().at(-1);
  const source = join(backups, name);
  const manifest = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8'));
  const dump = readFileSync(join(source, 'database.dump'));
  if (sha256(dump) !== manifest.database) throw new Error('Database dump failed its hash check.');

  compose(['up', '-d', '--no-deps', 'postgres', 'garage'], { stdio: 'ignore' });
  await waitFor(() => {
    compose(['exec', '-T', 'postgres', 'pg_isready', '-U', 'hucescholar', '-d', 'hucescholar'], {
      stdio: 'ignore',
    });
    return true;
  }, 'Postgres');
  await waitFor(() => {
    execFileSync(process.execPath, [`${root}scripts/rehearsal-init.mjs`], { stdio: 'ignore' });
    return true;
  }, 'Garage');

  compose(
    ['exec', '-T', 'postgres', 'pg_restore', '-U', 'hucescholar', '-d', 'hucescholar'].concat([
      '--no-owner',
      '--exit-on-error',
    ]),
    { input: dump, stdio: ['pipe', 'ignore', 'inherit'] },
  );

  const client = s3();
  for (const [key, entry] of Object.entries(manifest.objects)) {
    const bytes = readFileSync(join(source, 'objects', key));
    if (sha256(bytes) !== entry.sha256) throw new Error(`Object ${key} failed its hash check.`);
    await client.send(
      new PutObjectCommand({ Bucket, Key: key, Body: bytes, ContentType: entry.contentType }),
    );
  }
  const restoredKeys = await listKeys(client);
  client.destroy();

  const before = manifest.catalog;
  const after = await catalog();
  let failed = 0;
  const compare = (label, expected, actual) => {
    const same = JSON.stringify(expected) === JSON.stringify(actual);
    if (!same) failed++;
    console.log(
      `${same ? 'PASS' : 'FAIL'}  ${label} — ${same ? expected : `${expected} → ${actual}`}`,
    );
  };
  for (const key of ['constraints', 'indexes', 'partialIndexes', 'triggers'])
    compare(key, before[key], after[key]);
  compare('tables', Object.keys(before.rows).length, Object.keys(after.rows).length);
  compare(
    'rows across all tables',
    Object.values(before.rows).reduce((sum, value) => sum + value, 0),
    Object.values(after.rows).reduce((sum, value) => sum + value, 0),
  );
  compare('objects', Object.keys(manifest.objects).sort().length, restoredKeys.length);
  process.exitCode = failed ? 1 : 0;
}

const actions = { backup, wipe, restore };
const action = actions[process.argv[2]];
if (!action) throw new Error('Usage: rehearsal-recovery.mjs backup|wipe|restore [backup-name]');
await action();
