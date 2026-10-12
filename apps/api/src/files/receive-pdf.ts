import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export function pdfHeaders(
  type: string | undefined,
  encodedName: string | undefined,
  match: string | undefined,
) {
  let name = '';
  try {
    name = decodeURIComponent(encodedName ?? '');
  } catch {
    /* Invalid URI is rejected below. */
  }
  if (
    type?.split(';')[0].trim().toLowerCase() !== 'application/pdf' ||
    !/\.pdf$/i.test(name) ||
    name.length > 255 ||
    /[\x00-\x1f\x7f/\\]/.test(name)
  )
    throw new BadRequestException({ code: 'INVALID_PDF', message: 'Cần một PDF có tên hợp lệ.' });
  if (!match || !/^"[1-9]\d{0,9}"$/.test(match) || Number(match.slice(1, -1)) > 2147483647)
    throw new BadRequestException({ code: 'INVALID_REVISION', message: 'Thiếu revision hợp lệ.' });
  return { name, revision: Number(match.slice(1, -1)) };
}
export async function receivePdf(
  source: Readable,
  path: string,
  maxBytes: number,
  timeout = 60_000,
) {
  let size = 0;
  let prefix = Buffer.alloc(0);
  const hash = createHash('sha256');
  const guard = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes)
        return callback(
          new PayloadTooLargeException({
            code: 'PDF_TOO_LARGE',
            message: 'PDF vượt giới hạn dung lượng.',
          }),
        );
      if (prefix.length < 8) prefix = Buffer.concat([prefix, chunk.subarray(0, 8 - prefix.length)]);
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(source, guard, createWriteStream(path, { flags: 'wx', mode: 0o600 }), {
    signal: AbortSignal.timeout(timeout),
  });
  if (!/^%PDF-\d\.\d/.test(prefix.toString('ascii')))
    throw new BadRequestException({ code: 'INVALID_PDF', message: 'Chữ ký PDF không hợp lệ.' });
  return { size, sha256: hash.digest('hex') };
}
