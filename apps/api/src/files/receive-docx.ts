import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const DOCX_MAX_BYTES = 25 * 1024 * 1024;
export function docxHeaders(
  type?: string,
  encodedName?: string,
  match?: string,
  requestId?: string,
) {
  let name = '';
  try {
    name = decodeURIComponent(encodedName ?? '');
  } catch {
    /* reject below */
  }
  if (
    type?.split(';')[0].trim().toLowerCase() !== DOCX_MIME ||
    !/\.docx$/i.test(name) ||
    name.length > 255 ||
    /[\x00-\x1f\x7f/\\]/.test(name)
  )
    throw new BadRequestException({
      code: 'INVALID_DOCX',
      message: 'Cần file DOCX có tên hợp lệ.',
    });
  if (!match || !/^"[1-9]\d{0,9}"$/.test(match) || Number(match.slice(1, -1)) > 2147483647)
    throw new BadRequestException({ code: 'INVALID_REVISION', message: 'Thiếu revision hợp lệ.' });
  if (
    !requestId ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId)
  )
    throw new BadRequestException({ code: 'INVALID_UPLOAD_ID', message: 'Thiếu mã lượt tải lên.' });
  return { name, revision: Number(match.slice(1, -1)), requestId: requestId.toLowerCase() };
}
export async function receiveDocx(source: Readable, path: string, maxBytes = DOCX_MAX_BYTES) {
  let size = 0;
  let prefix = Buffer.alloc(0);
  const hash = createHash('sha256');
  const guard = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes)
        return callback(
          new PayloadTooLargeException({
            code: 'DOCX_TOO_LARGE',
            message: 'DOCX vượt giới hạn 25 MiB.',
          }),
        );
      if (prefix.length < 4) prefix = Buffer.concat([prefix, chunk.subarray(0, 4 - prefix.length)]);
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(source, guard, createWriteStream(path, { flags: 'wx', mode: 0o600 }), {
    signal: AbortSignal.timeout(60_000),
  });
  if (!prefix.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])))
    throw new BadRequestException({
      code: 'INVALID_DOCX',
      message: 'File không có chữ ký DOCX hợp lệ.',
    });
  return { size, sha256: hash.digest('hex') };
}
