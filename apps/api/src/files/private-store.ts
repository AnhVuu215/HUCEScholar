import { GoneException, Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { constants, createReadStream } from 'node:fs';
import { access, copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { FILE_CONFIG, FileConfiguration } from './files.config';
import { DOCX_MIME } from './receive-docx';
/** The database names an object the store no longer has: not a network problem, retrying won't help. */
export class MissingObjectError extends Error {
  constructor() {
    super('Private object missing.');
  }
}
/**
 * 410 FILE_MISSING for a reader, preview or review of a file whose bytes are gone. Logs the file id
 * (never the key or a path) so an operator can find it; `pnpm --filter @hucescholar/api doctor:files` lists them all.
 */
export function fileMissing(fileId: bigint | string) {
  Logger.warn(`Private object missing for file ${fileId}.`, 'Files');
  return new GoneException({
    code: 'FILE_MISSING',
    message: 'File PDF của phiên bản này không còn trên máy chủ.',
  });
}
const notFound = (error: unknown) =>
  (error as NodeJS.ErrnoException)?.code === 'ENOENT' || (error as Error)?.name === 'NoSuchKey';
export interface ByteRange {
  start: number;
  end: number;
}

@Injectable()
export class PrivateStore implements OnModuleDestroy {
  private readonly s3: S3Client | null;
  constructor(@Inject(FILE_CONFIG) private readonly config: FileConfiguration) {
    this.s3 =
      config.driver === 's3' ? new S3Client({ region: config.region, maxAttempts: 2 }) : null;
  }
  private path(key: string, source = false) {
    if (!(source ? /^sources\/[a-f0-9-]{36}\.docx$/ : /^quarantine\/[a-f0-9-]{36}\.pdf$/).test(key))
      throw new Error('Invalid private object key.');
    return join(this.config.root, key);
  }
  putSource(key: string, source: string, size: number) {
    return this.put(key, source, size, true);
  }
  readSource(key: string, range?: ByteRange) {
    return this.read(key, range, true);
  }
  removeSource(key: string) {
    return this.remove(key, true);
  }
  async put(key: string, source: string, size: number, isSource = false) {
    const path = this.path(key, isSource);
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: createReadStream(source),
          ContentLength: size,
          ContentType: isSource ? DOCX_MIME : 'application/pdf',
          IfNoneMatch: '*',
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
    } else {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await copyFile(source, path, constants.COPYFILE_EXCL);
    }
  }
  async read(key: string, range?: ByteRange, isSource = false): Promise<Readable> {
    const path = this.path(key, isSource);
    if (
      range &&
      (!Number.isSafeInteger(range.start) ||
        !Number.isSafeInteger(range.end) ||
        range.start < 0 ||
        range.end < range.start)
    )
      throw new Error('Invalid private byte range.');
    if (!this.s3) {
      await access(path, constants.R_OK).catch((error: unknown) => {
        throw notFound(error) ? new MissingObjectError() : error;
      });
      return createReadStream(path, range);
    }
    const object = await this.s3
      .send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      )
      .catch((error: unknown) => {
        throw notFound(error) ? new MissingObjectError() : error;
      });
    if (!(object.Body instanceof Readable)) throw new Error('Private object unavailable.');
    if (
      range &&
      (!object.ContentRange?.startsWith(`bytes ${range.start}-${range.end}/`) ||
        object.ContentLength !== range.end - range.start + 1)
    ) {
      object.Body.destroy();
      throw new Error('Private range response mismatch.');
    }
    return object.Body;
  }
  /** Readiness probe: the private bucket answers, or the local root exists and is writable. */
  async reachable(signal: AbortSignal) {
    if (this.s3) {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.config.bucket }), {
        abortSignal: signal,
      });
      return;
    }
    await mkdir(this.config.root, { recursive: true });
    await access(this.config.root, constants.W_OK);
  }
  /** Whether the object is still there; for the doctor:files check, not for serving. */
  async exists(key: string, isSource = false) {
    try {
      (await this.read(key, { start: 0, end: 0 }, isSource)).destroy();
      return true;
    } catch (error) {
      if (error instanceof MissingObjectError) return false;
      throw error;
    }
  }
  async remove(key: string, isSource = false) {
    const path = this.path(key, isSource);
    if (this.s3)
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(10_000),
      });
    else await rm(path, { force: true });
  }
  onModuleDestroy() {
    this.s3?.destroy();
  }
}
