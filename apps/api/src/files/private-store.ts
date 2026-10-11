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

@Injectable()
export class PrivateStore implements OnModuleDestroy {
  private readonly s3: S3Client | null;
  constructor(@Inject(FILE_CONFIG) private readonly config: FileConfiguration) {
    this.s3 =
      config.driver === 's3' ? new S3Client({ region: config.region, maxAttempts: 2 }) : null;
  }
  private path(key: string) {
    if (!/^quarantine\/[a-f0-9-]{36}\.pdf$/.test(key))
      throw new Error('Invalid private object key.');
    return join(this.config.root, key);
  }
  async put(key: string, source: string, size: number) {
    const path = this.path(key);
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: createReadStream(source),
          ContentLength: size,
          ContentType: 'application/pdf',
          IfNoneMatch: '*',
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
    } else {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await copyFile(source, path, constants.COPYFILE_EXCL);
    }
  }
  async read(key: string): Promise<Readable> {
    const path = this.path(key);
    if (!this.s3) return createReadStream(path);
    const object = await this.s3.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(30_000) },
    );
    if (!(object.Body instanceof Readable)) throw new Error('Private object unavailable.');
    return object.Body;
  }
  async remove(key: string) {
    const path = this.path(key);
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
