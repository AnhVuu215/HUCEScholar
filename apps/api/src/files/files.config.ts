import { resolve } from 'node:path';

export const FILE_CONFIG = Symbol('FILE_CONFIG');
export interface FileConfiguration {
  driver: 'local' | 's3';
  root: string;
  maxBytes: number;
  bucket: string;
  region: string;
  /** S3-compatible service (Garage in the OPS-02 rehearsal); unset means AWS itself. */
  endpoint: string | undefined;
  clamHost: string;
  clamPort: number;
  pdfinfo: string;
  pdftotext: string;
}
export function fileConfiguration(env: NodeJS.ProcessEnv): FileConfiguration {
  const driver = env.FILE_STORAGE ?? 'local';
  if (!['local', 's3'].includes(driver) || (env.NODE_ENV === 'production' && driver !== 's3'))
    throw new Error('Production requires private S3 storage.');
  const maxBytes = Number(env.PDF_MAX_BYTES ?? 25 * 1024 * 1024);
  const clamPort = Number(env.CLAMAV_PORT ?? 3310);
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1024 ||
    maxBytes > 50 * 1024 * 1024 ||
    !Number.isInteger(clamPort) ||
    clamPort < 1 ||
    clamPort > 65535
  )
    throw new Error('Invalid file limits or scanner port.');
  if (driver === 's3' && (!env.S3_BUCKET || !env.AWS_REGION))
    throw new Error('S3 bucket and region required.');
  const endpoint = env.S3_ENDPOINT || undefined;
  if (endpoint) {
    let url: URL | undefined;
    try {
      url = new URL(endpoint);
    } catch {
      url = undefined;
    }
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error('S3_ENDPOINT must be an HTTP(S) URL without credentials.');
  }
  return {
    driver: driver as FileConfiguration['driver'],
    root: resolve(
      env.FILE_LOCAL_ROOT ||
        resolve(
          __dirname,
          env.NODE_ENV === 'test' ? '../../../../.local/files-test' : '../../../../.local/files',
        ),
    ),
    maxBytes,
    bucket: env.S3_BUCKET ?? '',
    region: env.AWS_REGION ?? '',
    endpoint,
    clamHost: env.CLAMAV_HOST ?? '127.0.0.1',
    clamPort,
    pdfinfo: env.PDFINFO_BIN ?? 'pdfinfo',
    pdftotext: env.PDFTOTEXT_BIN ?? 'pdftotext',
  };
}
