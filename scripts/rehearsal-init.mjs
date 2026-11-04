// OPS-02 rehearsal: gives the single Garage node a layout, then creates the private bucket and an
// app key allowed on that bucket only. Safe to run again. Secrets stay in infra/.env.rehearsal.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../infra/.env.rehearsal', import.meta.url));
const composeFile = fileURLToPath(new URL('../infra/compose.rehearsal.yaml', import.meta.url));
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);
const bucket = 'hucescholar-private';
const garage = (...args) =>
  execFileSync(
    'docker',
    [
      'compose',
      '--env-file',
      envFile,
      '-f',
      composeFile,
      'exec',
      '-T',
      'garage',
      '/garage',
      ...args,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
const attempt = (...args) => {
  try {
    return garage(...args);
  } catch {
    return null;
  }
};

const nodeId = garage('node', 'id', '-q').trim().split('@')[0];
if (!/Current cluster layout version: [1-9]/.test(garage('layout', 'show'))) {
  garage('layout', 'assign', '-z', 'rehearsal', '-c', '1G', nodeId.slice(0, 16));
  garage('layout', 'apply', '--version', '1');
}
if (!attempt('bucket', 'info', bucket)) garage('bucket', 'create', bucket);
if (!attempt('key', 'info', env.S3_APP_KEY_ID))
  garage('key', 'import', '--yes', '-n', 'hucescholar-app', env.S3_APP_KEY_ID, env.S3_APP_SECRET);
garage('bucket', 'allow', '--read', '--write', bucket, '--key', env.S3_APP_KEY_ID);
console.log(`Garage ready: bucket ${bucket}, app key limited to it.`);
