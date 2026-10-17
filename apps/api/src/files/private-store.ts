import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { constants, createReadStream } from 'node:fs';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { FILE_CONFIG, FileConfiguration } from './files.config';
import { DOCX_MIME } from './receive-docx';
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
    if (!this.s3) return createReadStream(path, range);
    const object = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
      }),
      { abortSignal: AbortSignal.timeout(30_000) },
    );
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
