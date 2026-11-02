import { Inject, Injectable, Logger, Module } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseService } from '../database/database.module';
import { FILE_CONFIG, FileConfiguration } from '../files/files.config';
import { FilesModule } from '../files/files.module';
import { clamScan, FileCheckError } from '../files/pdf-scanner';
import { MissingObjectError, PrivateStore } from '../files/private-store';
import { ScanQueue } from '../files/scan-queue';
import { thumbKey } from './notebook-assets.service';
import { TRASH_DAYS } from './notebooks.service';

/** An unused image is kept this long, so undo or a slow autosave can still place it. */
export const ORPHAN_GRACE_HOURS = 24;

/**
 * CANVAS-01 work for the file worker: ClamAV checks of notebook images (the API already re-encoded
 * them), plus the daily-ish cleanup of the trash and of images no page uses any more.
 */
@Injectable()
export class NotebookImagesProcessor {
  constructor(
    private readonly db: DatabaseService,
    private readonly store: PrivateStore,
    private readonly queue: ScanQueue,
    @Inject(FILE_CONFIG) private readonly config: FileConfiguration,
  ) {}

  async process(rawId: string, finalAttempt: boolean) {
    if (!/^[1-9]\d*$/.test(rawId)) throw new Error('Invalid image job.');
    const id = BigInt(rawId);
    const asset = await this.db.notebook_assets.findUnique({ where: { id } });
    if (!asset || asset.scan_status !== 'CHECKING') return;
    let directory: string | undefined;
    try {
      const root = join(this.config.root, 'tmp');
      await mkdir(root, { recursive: true, mode: 0o700 });
      directory = await mkdtemp(join(root, 'image-'));
      for (const [index, key] of [asset.object_key, thumbKey(asset.object_key)].entries()) {
        const path = await this.store.imageFile(key, join(directory, `${index}.webp`));
        await clamScan(path, this.config.clamHost, this.config.clamPort);
      }
      await this.db.notebook_assets.updateMany({
        where: { id, scan_status: 'CHECKING' },
        data: { scan_status: 'SAFE', checked_at: new Date() },
      });
    } catch (error) {
      if (error instanceof FileCheckError && !error.retryable) {
        await this.fail(id, error.code);
        throw new UnrecoverableError('Image safety check failed.');
      }
      if (error instanceof MissingObjectError) {
        await this.fail(id, 'FILE_MISSING');
        throw new UnrecoverableError('Image object missing.');
      }
      if (finalAttempt)
        await this.fail(id, error instanceof FileCheckError ? 'CHECK_UNAVAILABLE' : null);
      throw new Error('Image safety check failed.');
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  private async fail(id: bigint, reason: string | null) {
    await this.db.notebook_assets.updateMany({
      where: { id, scan_status: 'CHECKING' },
      data: { scan_status: 'FAILED', check_error: reason, checked_at: new Date() },
    });
  }

  /** Images still CHECKING without a live job (the API could not reach Redis) are queued again. */
  async reconcile() {
    let cursor: bigint | undefined;
    for (;;) {
      const rows = await this.db.notebook_assets.findMany({
        where: { scan_status: 'CHECKING', ...(cursor ? { id: { gt: cursor } } : {}) },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
      });
      for (const row of rows) {
        const id = String(row.id);
        const job = await this.queue.queue.getJob(`image-${id}`);
        if (!job) await this.queue.enqueueImage(id);
        else {
          const state = await job.getState();
          if (state === 'failed') await this.fail(row.id, 'CHECK_UNAVAILABLE');
          if (state === 'completed') {
            await job.remove();
            await this.queue.enqueueImage(id);
          }
        }
      }
      if (rows.length < 100) return;
      cursor = rows[rows.length - 1].id;
    }
  }

  /**
   * Deletes notebooks left in the trash past 30 days, then images that no page of their owner
   * places any more (after a grace period). Rows go first, bytes after: a crash leaves at worst
   * an unreferenced object, never a row pointing at missing bytes.
   */
  async sweep(now = new Date()) {
    const expired = new Date(now.getTime() - TRASH_DAYS * 86_400_000);
    const purged = await this.db.notebooks.deleteMany({ where: { deleted_at: { lt: expired } } });
    const grace = new Date(now.getTime() - ORPHAN_GRACE_HOURS * 3_600_000);
    let removed = 0;
    for (;;) {
      const orphans = await this.db.$queryRaw<{ id: bigint; object_key: string }[]>`
        SELECT a.id, a.object_key FROM hucescholar.notebook_assets a
        WHERE a.created_at < ${grace}
          AND NOT EXISTS (
            SELECT 1 FROM hucescholar.notebook_pages p
            JOIN hucescholar.notebooks n ON n.id = p.notebook_id
            WHERE n.user_id = a.user_id
              AND p.content @> jsonb_build_object(
                'items', jsonb_build_array(jsonb_build_object('assetId', a.id::text)))
          )
        ORDER BY a.id
        LIMIT 100`;
      if (!orphans.length) break;
      await this.db.notebook_assets.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
      for (const orphan of orphans)
        await Promise.all([
          this.store.removeImage(orphan.object_key),
          this.store.removeImage(thumbKey(orphan.object_key)),
        ]).catch(() => Logger.warn('Notebook image cleanup required.', 'FileWorker'));
      removed += orphans.length;
      if (orphans.length < 100) break;
    }
    return { notebooks: purged.count, images: removed };
  }
}

@Module({
  imports: [FilesModule],
  providers: [NotebookImagesProcessor],
  exports: [NotebookImagesProcessor],
})
export class NotebookImagesModule {}
