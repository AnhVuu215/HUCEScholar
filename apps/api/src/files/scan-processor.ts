import { Inject, Injectable } from '@nestjs/common';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseService } from '../database/database.module';
import { FILE_CONFIG, FileConfiguration } from './files.config';
import { PrivateStore } from './private-store';
import { PdfScanner } from './pdf-scanner';
import { receivePdf } from './receive-pdf';
import { ScanQueue } from './scan-queue';

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
      await this.db.files.updateMany({
        where: { id, scan_status: 'CHECKING' },
        data: {
          scan_status: 'SAFE',
          page_count: result.pageCount,
          has_text_layer: result.hasTextLayer,
          checked_at: new Date(),
        },
      });
    } catch {
      if (finalAttempt) await this.fail(rawId);
      throw new Error('PDF safety check failed.');
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  async fail(id: string) {
    await this.db.files.updateMany({
      where: { id: BigInt(id), scan_status: 'CHECKING' },
      data: { scan_status: 'FAILED', checked_at: new Date() },
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
