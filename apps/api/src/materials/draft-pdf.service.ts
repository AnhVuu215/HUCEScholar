import {
  Inject,
  Injectable,
  HttpException,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Request } from 'express';
import { Profile } from '../auth/auth.types';
import { DatabaseService } from '../database/database.module';
import { FILE_CONFIG, FileConfiguration } from '../files/files.config';
import { PrivateStore } from '../files/private-store';
import { pdfHeaders, receivePdf } from '../files/receive-pdf';
import { ScanQueue } from '../files/scan-queue';
import { MaterialsService } from './materials.service';

@Injectable()
export class DraftPdfService {
  private readonly active = new Set<string>();
  constructor(
    private readonly db: DatabaseService,
    private readonly materials: MaterialsService,
    private readonly store: PrivateStore,
    private readonly queue: ScanQueue,
    @Inject(FILE_CONFIG) private readonly config: FileConfiguration,
  ) {}
  async upload(actor: Profile, id: string, req: Request) {
    const { name, revision } = pdfHeaders(
      req.get('Content-Type'),
      req.get('X-File-Name'),
      req.get('If-Match'),
    );
    if (Number(req.get('Content-Length')) > this.config.maxBytes)
      throw new PayloadTooLargeException({ code: 'PDF_TOO_LARGE', message: 'PDF quá lớn.' });
    if (this.active.has(actor.id) || this.active.size >= 2)
      throw new HttpException(
        { code: 'UPLOAD_BUSY', message: 'Đang có lượt tải lên. Thử lại sau.' },
        429,
      );
    this.active.add(actor.id);
    let directory: string | undefined;
    const key = `quarantine/${randomUUID()}.pdf`;
    let stored = false;
    let committed = false;
    let attachmentStarted = false;
    let callbackCompleted = false;
    try {
      await this.db.$transaction((tx) => this.materials.lockDraft(tx, actor, id, revision));
      const temp = join(this.config.root, 'tmp');
      await mkdir(temp, { recursive: true, mode: 0o700 });
      directory = await mkdtemp(join(temp, 'upload-'));
      const path = join(directory, 'document.pdf');
      const received = await receivePdf(req, path, this.config.maxBytes);
      stored = true; // Also clean up a partial object if a storage operation fails.
      await this.store.put(key, path, received.size);
      attachmentStarted = true;
      const fileId = await this.db.$transaction(async (tx) => {
        const {
          actorId,
          row,
          id: documentId,
        } = await this.materials.lockDraft(tx, actor, id, revision);
        const file = await tx.files.create({
          data: {
            uploaded_by: actorId,
            object_key: key,
            original_name: name,
            byte_size: received.size,
            sha256: received.sha256,
          },
        });
        await tx.document_versions.update({
          where: { id: row.id },
          data: { file_id: file.id, revision: { increment: 1 }, updated_at: new Date() },
        });
        await tx.documents.update({
          where: { id: documentId },
          data: { revision: { increment: 1 }, updated_at: new Date() },
        });
        await this.materials.audit(tx, actorId, documentId, 'MATERIAL_PDF_UPLOADED');
        callbackCompleted = true;
        return String(file.id);
      });
      committed = true;
      try {
        await this.queue.enqueue(fileId);
      } catch {
        Logger.warn('PDF saved; queue reconciliation required.', 'Files');
      }
      return await this.materials.get(actor, id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException({
        code: 'UPLOAD_UNCERTAIN',
        message: 'Upload gián đoạn. Mở lại bản nháp để kiểm tra trước khi thử lại.',
      });
    } finally {
      // COMMIT acknowledgment can fail after the transaction has persisted.
      // Keep immutable bytes when the callback completed but the outcome is uncertain.
      if (stored && !committed && (!attachmentStarted || !callbackCompleted))
        await this.store
          .remove(key)
          .catch(() => Logger.warn('Private object cleanup required.', 'Files'));
      if (stored && !committed && callbackCompleted)
        Logger.warn('PDF commit outcome uncertain; immutable object retained.', 'Files');
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
      this.active.delete(actor.id);
    }
  }
}
