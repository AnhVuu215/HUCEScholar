import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
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
import { docxHeaders, DOCX_MAX_BYTES, receiveDocx } from '../files/receive-docx';
import { SourceConversionQueue } from '../files/source-conversion-queue';
import { MaterialsService } from './materials.service';
import { SourceRetryDto } from './materials.dto';

@Injectable()
export class SourceUploadService {
  private readonly active = new Set<string>();
  constructor(
    private readonly db: DatabaseService,
    private readonly materials: MaterialsService,
    private readonly store: PrivateStore,
    private readonly queue: SourceConversionQueue,
    @Inject(FILE_CONFIG) private readonly config: FileConfiguration,
  ) {}

  async upload(actor: Profile, id: string, req: Request) {
    if (actor.role !== 'LECTURER') throw new ForbiddenException('Chỉ giảng viên tải Word.');
    const header = docxHeaders(
      req.get('Content-Type'),
      req.get('X-File-Name'),
      req.get('If-Match'),
      req.get('X-Upload-Id'),
    );
    if (Number(req.get('Content-Length')) > DOCX_MAX_BYTES)
      throw new PayloadTooLargeException({
        code: 'DOCX_TOO_LARGE',
        message: 'DOCX vượt giới hạn 25 MiB.',
      });
    if (this.active.has(actor.id) || this.active.size >= 2)
      throw new HttpException({ code: 'UPLOAD_BUSY', message: 'Đang tải file. Thử lại sau.' }, 429);
    this.active.add(actor.id);
    let directory: string | undefined;
    const key = `sources/${randomUUID()}.docx`;
    let stored = false;
    let callbackCompleted = false;
    let committed = false;
    try {
      // Replay may use the original revision, but never bypasses current ownership/assignment checks.
      await this.db.$transaction(async (tx) => {
        const { row } = await this.materials.lockDraft(tx, actor, id);
        const existing = await tx.document_source_uploads.findUnique({
          where: {
            uploaded_by_request_id: { uploaded_by: BigInt(actor.id), request_id: header.requestId },
          },
        });
        if (!existing && row.revision !== header.revision)
          throw new ConflictException({
            code: 'STALE_REVISION',
            message: 'Bản nháp đã thay đổi. Tải lại trạng thái.',
          });
      });
      const temp = join(this.config.root, 'tmp');
      await mkdir(temp, { recursive: true, mode: 0o700 });
      directory = await mkdtemp(join(temp, 'source-upload-'));
      const path = join(directory, 'source.docx');
      const bytes = await receiveDocx(req, path);
      // Store before DB attachment; commit acknowledgment failures retain possibly referenced bytes.
      stored = true;
      await this.store.putSource(key, path, bytes.size);
      const sourceId = await this.db.$transaction(async (tx) => {
        const { row, actorId, id: documentId } = await this.materials.lockDraft(tx, actor, id);
        const existing = await tx.document_source_uploads.findUnique({
          where: { uploaded_by_request_id: { uploaded_by: actorId, request_id: header.requestId } },
        });
        if (existing) {
          if (
            existing.version_id !== row.id ||
            existing.sha256 !== bytes.sha256 ||
            existing.byte_size !== BigInt(bytes.size) ||
            existing.original_name !== header.name ||
            row.source_upload?.id !== existing.id
          )
            throw new ConflictException({
              code: 'UPLOAD_ID_CONFLICT',
              message: 'Mã tải lên đã được dùng cho file khác hoặc file đã bị thay.',
            });
          return String(existing.id);
        }
        if (row.revision !== header.revision)
          throw new ConflictException({
            code: 'STALE_REVISION',
            message: 'Bản nháp đã thay đổi. Tải lại trạng thái.',
          });
        const source = await tx.document_source_uploads.create({
          data: {
            version_id: row.id,
            uploaded_by: actorId,
            request_id: header.requestId,
            object_key: key,
            original_name: header.name,
            byte_size: bytes.size,
            sha256: bytes.sha256,
          },
        });
        await tx.document_versions.update({
          where: { id: row.id },
          data: {
            source_upload_id: source.id,
            file_id: null,
            revision: { increment: 1 },
            updated_at: new Date(),
          },
        });
        await tx.documents.update({
          where: { id: documentId },
          data: { revision: { increment: 1 }, updated_at: new Date() },
        });
        await this.materials.audit(tx, actorId, documentId, 'MATERIAL_DOCX_UPLOADED');
        callbackCompleted = true;
        return String(source.id);
      });
      committed = callbackCompleted;
      if (!callbackCompleted) {
        await this.store.removeSource(key);
        stored = false;
      }
      await this.queue
        .enqueue(sourceId)
        .catch(() => Logger.warn('Source saved; reconciliation required.', 'Files'));
      return await this.materials.get(actor, id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException({
        code: 'UPLOAD_UNCERTAIN',
        message: 'Chưa xác nhận được tải lên. Tải lại bản nháp trước khi thử lại.',
      });
    } finally {
      if (stored && !committed && !callbackCompleted)
        await this.store
          .removeSource(key)
          .catch(() => Logger.warn('Source cleanup required.', 'Files'));
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
      this.active.delete(actor.id);
    }
  }
  async retry(actor: Profile, id: string, body: SourceRetryDto) {
    if (actor.role !== 'LECTURER') throw new ForbiddenException();
    const sourceId = await this.db.$transaction(async (tx) => {
      const {
        row,
        actorId,
        id: documentId,
      } = await this.materials.lockDraft(tx, actor, id, body.revision);
      if (!row.source_upload || String(row.source_upload.id) !== body.sourceUploadId)
        throw new ConflictException({ code: 'SOURCE_CHANGED', message: 'Nguồn đã thay đổi.' });
      const source = await tx.document_source_uploads.findUniqueOrThrow({
        where: { id: row.source_upload.id },
      });
      if (
        source.uploaded_by !== actorId ||
        source.conversion_status !== 'FAILED' ||
        !['PROCESSOR_UNAVAILABLE', 'CONVERSION_TIMEOUT', 'CONVERSION_FAILED'].includes(
          source.error_code ?? '',
        )
      )
        throw new ConflictException({
          code: 'SOURCE_NOT_RETRYABLE',
          message: 'File này cần được thay bằng một file hợp lệ khác.',
        });
      await tx.document_source_uploads.update({
        where: { id: source.id },
        data: {
          conversion_status: 'QUEUED',
          error_code: null,
          processing_token: null,
          lease_expires_at: null,
          attempt_count: 0,
          updated_at: new Date(),
        },
      });
      await tx.document_versions.update({
        where: { id: row.id },
        data: { revision: { increment: 1 }, updated_at: new Date() },
      });
      await this.materials.audit(tx, actorId, documentId, 'MATERIAL_DOCX_RETRIED');
      return String(source.id);
    });
    await this.queue
      .enqueue(sourceId)
      .catch(() => Logger.warn('Source retry saved; reconciliation required.', 'Files'));
    return this.materials.get(actor, id);
  }
}
