import { Inject, Injectable } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseService } from '../database/database.module';
import { Prisma } from '../generated/prisma/client';
import { FILE_CONFIG, FileConfiguration } from './files.config';
import { PrivateStore } from './private-store';
import { FileCheckCode, FileCheckError, PdfScanner } from './pdf-scanner';
import { receivePdf } from './receive-pdf';
import { ScanQueue } from './scan-queue';
import { notify } from '../notifications/notify';

@Injectable()
export class ScanProcessor {
  constructor(
    private readonly db: DatabaseService,
    private readonly store: PrivateStore,
    private readonly scanner: PdfScanner,
    private readonly queue: ScanQueue,
    @Inject(FILE_CONFIG) private readonly config: FileConfiguration,
  ) {}
  async process(rawId: string, finalAttempt: boolean) {
    if (!/^[1-9]\d*$/.test(rawId)) throw new Error('Invalid file job.');
    const id = BigInt(rawId);
    const file = await this.db.files.findUnique({ where: { id } });
    if (!file || file.scan_status !== 'CHECKING') return;
    let directory: string | undefined;
    try {
      const root = join(this.config.root, 'tmp');
      await mkdir(root, { recursive: true, mode: 0o700 });
      directory = await mkdtemp(join(root, 'scan-'));
      const path = join(directory, 'document.pdf');
      const checked = await receivePdf(
        await this.store.read(file.object_key),
        path,
        this.config.maxBytes,
      );
      if (checked.sha256 !== file.sha256 || BigInt(checked.size) !== file.byte_size)
        throw new Error('Private object changed.');
      const result = await this.scanner.scan(path);
      await this.db.$transaction(async (tx) => {
        const { count } = await tx.files.updateMany({
          where: { id, scan_status: 'CHECKING' },
          data: {
            scan_status: 'SAFE',
            page_count: result.pageCount,
            has_text_layer: result.hasTextLayer,
            copy_restricted: result.copyRestricted,
            checked_at: new Date(),
          },
        });
        if (count) await this.notifyUploader(tx, id, 'FILE_SAFE', null);
      });
    } catch (error) {
      // A verdict about the file itself will not change on retry: record it and stop.
      if (error instanceof FileCheckError && !error.retryable) {
        await this.fail(rawId, error.code);
        throw new UnrecoverableError('PDF safety check failed.');
      }
      if (finalAttempt)
        await this.fail(rawId, error instanceof FileCheckError ? 'CHECK_UNAVAILABLE' : null);
      throw new Error('PDF safety check failed.');
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  async fail(id: string, reason: FileCheckCode | 'CHECK_UNAVAILABLE' | null = null) {
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.files.updateMany({
        where: { id: BigInt(id), scan_status: 'CHECKING' },
        data: { scan_status: 'FAILED', check_error: reason, checked_at: new Date() },
      });
      if (count) await this.notifyUploader(tx, BigInt(id), 'FILE_FAILED', reason);
    });
  }
  /** Tells the uploader once the check settles; a file not attached to a draft has no link. */
  private async notifyUploader(
    tx: Prisma.TransactionClient,
    id: bigint,
    kind: 'FILE_SAFE' | 'FILE_FAILED',
    detail: string | null,
  ) {
    const file = await tx.files.findUniqueOrThrow({
      where: { id },
      select: { uploaded_by: true, check_round: true },
    });
    const version = await tx.document_versions.findFirst({
      where: { file_id: id },
      select: { id: true },
      orderBy: { id: 'desc' },
    });
    if (version)
      await notify(tx, {
        userId: file.uploaded_by,
        kind,
        eventKey: file.check_round > 1 ? `file:${id}:${file.check_round}` : `file:${id}`,
        versionId: version.id,
        detail,
      });
  }
  async reconcile() {
    // Stable ordering by ID and scan cursor covers more than the first batch.
    let cursor: bigint | undefined;
    for (;;) {
      const files = await this.db.files.findMany({
        where: { scan_status: 'CHECKING', ...(cursor ? { id: { gt: cursor } } : {}) },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
      });
      for (const file of files) {
        const id = String(file.id);
        const job = await this.queue.queue.getJob(`file-${id}`);
        if (!job) await this.queue.enqueue(id);
        else {
          const state = await job.getState();
          if (state === 'failed') await this.fail(id);
          if (state === 'completed') {
            await job.remove();
            await this.queue.enqueue(id);
          }
        }
      }
      if (files.length < 100) return;
      cursor = files[files.length - 1].id;
    }
  }
}
