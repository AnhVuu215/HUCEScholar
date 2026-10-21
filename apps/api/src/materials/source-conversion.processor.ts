import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { DatabaseService } from '../database/database.module';
import { FILE_CONFIG, FileConfiguration } from '../files/files.config';
import { PrivateStore } from '../files/private-store';
import { receiveDocx } from '../files/receive-docx';
import { clamScan, FileCheckError, PdfScanner } from '../files/pdf-scanner';
import { convertDocx } from '../files/docx-converter-client';
import { SourceConversionQueue } from '../files/source-conversion-queue';
import { MaterialsService } from './materials.service';

@Injectable()
export class DocxTools {
  constructor(@Inject(FILE_CONFIG) private readonly config: FileConfiguration) {}
  scanSource(path: string) {
    return clamScan(path, this.config.clamHost, this.config.clamPort);
  }
  convert(source: string, pdf: string) {
    const url = process.env.DOCX_CONVERTER_URL;
    if (!url) return Promise.reject(new Error('PROCESSOR_UNAVAILABLE'));
    return convertDocx(source, pdf, url);
  }
}

@Injectable()
export class SourceConversionProcessor {
  constructor(
    private readonly db: DatabaseService,
    private readonly store: PrivateStore,
    private readonly materials: MaterialsService,
    private readonly tools: DocxTools,
    private readonly scanner: PdfScanner,
    private readonly queue: SourceConversionQueue,
    @Inject(FILE_CONFIG) private readonly config: FileConfiguration,
  ) {}

  async process(rawId: string) {
    if (!/^[1-9]\d*$/.test(rawId)) throw new Error('Invalid source job.');
    const id = BigInt(rawId),
      token = randomUUID(),
      now = new Date();
    // Ten minutes exceeds all bounded I/O/tool stages. Expired tokens can never attach output.
    const claimed = await this.db.document_source_uploads.updateMany({
      where: {
        id,
        attempt_count: { lt: 3 },
        OR: [
          { conversion_status: 'QUEUED' },
          { conversion_status: 'RUNNING', lease_expires_at: { lt: now } },
        ],
      },
      data: {
        conversion_status: 'RUNNING',
        processing_token: token,
        lease_expires_at: new Date(now.getTime() + 600_000),
        attempt_count: { increment: 1 },
        updated_at: now,
      },
    });
    if (!claimed.count) return;
    const source = await this.db.document_source_uploads.findUniqueOrThrow({
      where: { id },
      include: { version: { select: { document_id: true } } },
    });
    let directory: string | undefined;
    const outputKey = `quarantine/${randomUUID()}.pdf`;
    let stored = false,
      committed = false,
      callbackCompleted = false;
    let stage = 'INVALID_DOCX';
    let checkingAuthorization = false;
    try {
      const root = join(this.config.root, 'tmp');
      await mkdir(root, { recursive: true, mode: 0o700 });
      directory = await mkdtemp(join(root, 'convert-'));
      const input = join(directory, 'source.docx'),
        output = join(directory, 'rendered.pdf');
      const received = await receiveDocx(await this.store.readSource(source.object_key), input);
      if (received.sha256 !== source.sha256 || BigInt(received.size) !== source.byte_size)
        throw new Error('INVALID_DOCX');
      stage = 'SCAN_FAILED';
      await this.tools.scanSource(input);
      const scan = await this.db.document_source_uploads.updateMany({
        where: {
          id,
          processing_token: token,
          conversion_status: 'RUNNING',
          lease_expires_at: { gt: new Date() },
        },
        data: { scan_status: 'SAFE', checked_at: new Date() },
      });
      if (!scan.count) return;
      stage = 'CONVERSION_FAILED';
      const converted = await this.tools.convert(input, output);
      stage = 'SCAN_FAILED';
      const pdf = await this.scanner.scan(output);
      const size = (await stat(output)).size;
      if (!size || size > 25 * 1024 * 1024) throw new Error('CONVERSION_FAILED');
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(output)) hash.update(chunk as Buffer);
      stage = 'PROCESSOR_UNAVAILABLE';
      stored = true;
      await this.store.put(outputKey, output, size);
      const actor = {
        id: String(source.uploaded_by),
        role: 'LECTURER' as const,
        email: '',
        displayName: '',
      };
      checkingAuthorization = true;
      await this.db.$transaction(async (tx) => {
        const {
          row,
          id: documentId,
          actorId,
        } = await this.materials.lockDraft(tx, actor, String(source.version.document_id));
        await tx.$queryRaw`SELECT id FROM hucescholar.document_source_uploads WHERE id=${id} FOR UPDATE`;
        const current = await tx.document_source_uploads.findUniqueOrThrow({ where: { id } });
        if (
          current.processing_token !== token ||
          current.conversion_status !== 'RUNNING' ||
          !current.lease_expires_at ||
          current.lease_expires_at <= new Date()
        )
          return;
        if (row.id !== source.version_id || row.source_upload?.id !== id) {
          await tx.document_source_uploads.update({
            where: { id },
            data: {
              conversion_status: 'CANCELLED',
              error_code: 'SOURCE_SUPERSEDED',
              processing_token: null,
              lease_expires_at: null,
              updated_at: new Date(),
            },
          });
          return;
        }
        const file = await tx.files.create({
          data: {
            uploaded_by: actorId,
            object_key: outputKey,
            original_name: source.original_name.replace(/\.docx$/i, '.pdf'),
            byte_size: size,
            sha256: hash.digest('hex'),
            scan_status: 'SAFE',
            checked_at: new Date(),
            page_count: pdf.pageCount,
            has_text_layer: pdf.hasTextLayer,
            copy_restricted: pdf.copyRestricted,
          },
        });
        await tx.document_source_uploads.update({
          where: { id },
          data: {
            conversion_status: 'READY',
            rendered_file_id: file.id,
            converter_build: converted.converterBuild,
            error_code: null,
            processing_token: null,
            lease_expires_at: null,
            updated_at: new Date(),
          },
        });
        // Only file state changes: preserve metadata edits made during conversion.
        await tx.document_versions.update({
          where: { id: row.id },
          data: { file_id: file.id, revision: { increment: 1 }, updated_at: new Date() },
        });
        await tx.documents.update({
          where: { id: documentId },
          data: { revision: { increment: 1 }, updated_at: new Date() },
        });
        await this.materials.audit(tx, actorId, documentId, 'MATERIAL_DOCX_READY');
        callbackCompleted = true;
      });
      committed = callbackCompleted;
    } catch (error) {
      // A transaction callback completed before COMMIT acknowledgment: retain immutable output.
      if (callbackCompleted) {
        Logger.warn('Rendition commit uncertain; output retained.', 'Files');
        throw new Error('Rendition commit uncertain.');
      }
      const named =
        error instanceof FileCheckError && error.retryable
          ? 'PROCESSOR_UNAVAILABLE'
          : error instanceof Error
            ? error.message
            : '';
      const code = [
        'INVALID_DOCX',
        'PROCESSOR_UNAVAILABLE',
        'CONVERSION_FAILED',
        'CONVERSION_TIMEOUT',
      ].includes(named)
        ? named
        : stage;
      const cancelled = checkingAuthorization && error instanceof HttpException;
      const terminal =
        cancelled || ['INVALID_DOCX', 'SCAN_FAILED'].includes(code) || source.attempt_count >= 3;
      await this.db.document_source_uploads.updateMany({
        where: { id, processing_token: token, conversion_status: 'RUNNING' },
        data: {
          conversion_status: cancelled ? 'CANCELLED' : terminal ? 'FAILED' : 'QUEUED',
          error_code: cancelled ? 'AUTHORIZATION_CHANGED' : code,
          scan_status: code === 'SCAN_FAILED' ? 'FAILED' : undefined,
          checked_at: code === 'SCAN_FAILED' ? new Date() : undefined,
          processing_token: null,
          lease_expires_at: null,
          updated_at: new Date(),
        },
      });
      if (!terminal) throw new Error('Source processing interrupted.');
    } finally {
      if (stored && !committed && !callbackCompleted)
        await this.store
          .remove(outputKey)
          .catch(() => Logger.warn('Rendition cleanup required.', 'Files'));
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  async reconcile() {
    const now = new Date();
    await this.db.document_source_uploads.updateMany({
      where: {
        attempt_count: { gte: 3 },
        OR: [
          { conversion_status: 'QUEUED' },
          { conversion_status: 'RUNNING', lease_expires_at: { lt: now } },
        ],
      },
      data: {
        conversion_status: 'FAILED',
        error_code: 'PROCESSOR_UNAVAILABLE',
        processing_token: null,
        lease_expires_at: null,
        updated_at: now,
      },
    });
    let cursor: bigint | undefined;
    for (;;) {
      const rows = await this.db.document_source_uploads.findMany({
        where: {
          ...(cursor ? { id: { gt: cursor } } : {}),
          OR: [
            { conversion_status: 'QUEUED' },
            { conversion_status: 'RUNNING', lease_expires_at: { lt: now } },
          ],
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
      });
      for (const row of rows) await this.queue.enqueue(String(row.id));
      if (rows.length < 100) return;
      cursor = rows[rows.length - 1].id;
    }
  }
}
