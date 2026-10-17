import { createReadStream, createWriteStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export async function convertDocx(
  sourcePath: string,
  pdfPath: string,
  converterUrl: string,
  signal?: AbortSignal,
) {
  const size = (await stat(sourcePath)).size;
  if (!size || size > 25 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
  const request = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Length': String(size),
    },
    body: createReadStream(sourcePath),
    duplex: 'half',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(210_000)])
      : AbortSignal.timeout(210_000),
  };
  const response = await fetch(
    new URL('/convert', converterUrl),
    request as Parameters<typeof fetch>[1],
  );
  if (
    !response.ok ||
    !response.body ||
    response.headers.get('content-type') !== 'application/pdf'
  ) {
    await response.body?.cancel();
    throw new Error(response.status === 422 ? 'INVALID_DOCX' : 'PROCESSOR_UNAVAILABLE');
  }
  let total = 0;
  let prefix = Buffer.alloc(0);
  try {
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          total += chunk.length;
          if (total > 25 * 1024 * 1024) return callback(new Error('CONVERSION_FAILED'));
          if (prefix.length < 8)
            prefix = Buffer.concat([prefix, chunk.subarray(0, 8 - prefix.length)]);
          callback(null, chunk);
        },
      }),
      createWriteStream(pdfPath, { flags: 'wx', mode: 0o600 }),
      { signal: request.signal },
    );
    if (!/^%PDF-\d\.\d/.test(prefix.toString('ascii'))) throw new Error('CONVERSION_FAILED');
    const converterBuild = response.headers.get('x-converter-build') ?? '';
    if (!/^[\x20-\x7e]{1,200}$/.test(converterBuild)) throw new Error('CONVERSION_FAILED');
    return { converterBuild };
  } catch (error) {
    await rm(pdfPath, { force: true });
    throw error;
  }
}
