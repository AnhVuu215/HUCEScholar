import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  StreamableFile,
} from '@nestjs/common';
import { once } from 'node:events';
import type { Response } from 'express';
import { DatabaseService } from '../database/database.module';
import { Prisma } from '../generated/prisma/client';
import { academicId } from '../academic/academic.service';
import { Profile } from '../auth/auth.types';
import {
  PrivateStore,
  type ByteRange,
  MissingObjectError,
  fileMissing,
} from '../files/private-store';
import { LibraryListDto } from './library.dto';
import { DOCX_MIME } from '../files/receive-docx';
import { MaterialsService } from './materials.service';
import { foldedTerms } from './search-fold';

const selection = {
  id: true,
  document_id: true,
  version_no: true,
  title: true,
  authors: true,
  description: true,
  material_type: true,
  publication_method: true,
  source_reference: true,
  rights_basis: true,
  rights_valid_until: true,
  download_allowed: true,
  updated_at: true,
  files: {
    select: {
      id: true,
      byte_size: true,
      page_count: true,
      has_text_layer: true,
      copy_restricted: true,
    },
  },
  source_upload: {
    select: {
      original_name: true,
      byte_size: true,
      conversion_status: true,
      scan_status: true,
      rendered_file_id: true,
    },
  },
  version_courses: { select: { courses: { select: { id: true, code: true, name: true } } } },
  documents_document_versions_document_idTodocuments: {
    select: { kind: true, current_version_id: true },
  },
} satisfies Prisma.document_versionsSelect;
type LibraryRow = Prisma.document_versionsGetPayload<{ select: typeof selection }>;
/** What any signed-in reader may open: approved, safe, visible and within its rights period. */
export const available = (): Prisma.document_versionsWhereInput => ({
  review_status: 'APPROVED',
  files: { scan_status: 'SAFE' },
  documents_document_versions_document_idTodocuments: { visibility: 'VISIBLE' },
  OR: [{ rights_valid_until: null }, { rights_valid_until: { gt: new Date() } }],
});
type CurrentVersion = { versionId: string; versionNo: number; title: string };
function serialize(v: LibraryRow, currentVersion: CurrentVersion | null = null) {
  return {
    documentId: String(v.document_id),
    versionId: String(v.id),
    versionNo: v.version_no,
    title: v.title,
    authors: v.authors,
    description: v.description,
    materialType: v.material_type,
    publicationMethod: v.publication_method,
    kind: v.documents_document_versions_document_idTodocuments.kind,
    current: v.documents_document_versions_document_idTodocuments.current_version_id === v.id,
    sourceReference: v.source_reference,
    rightsBasis: v.rights_basis,
    rightsValidUntil: v.rights_valid_until?.toISOString() ?? null,
    downloadAllowed: v.download_allowed,
    pageCount: v.files!.page_count,
    hasTextLayer: v.files!.has_text_layer,
    copyRestricted: v.files!.copy_restricted,
    byteSize: Number(v.files!.byte_size),
    sourceFile:
      v.source_upload?.conversion_status === 'READY' &&
      v.source_upload.scan_status === 'SAFE' &&
      v.source_upload.rendered_file_id === v.files?.id
        ? {
            name: v.source_upload.original_name,
            byteSize: Number(v.source_upload.byte_size),
            format: 'DOCX' as const,
          }
        : null,
    courses: v.version_courses.map(({ courses: c }) => ({
      id: String(c.id),
      code: c.code,
      name: c.name,
    })),
    /** On an earlier version: the document's current version, only while it is readable too. */
    currentVersion,
  };
}
// A single byte range only; malformed, multi-range and unsatisfiable requests fail closed.
function byteRange(value: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const max = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix === 0n) return null;
    return { start: Number(suffix >= max ? 0n : max - suffix), end: size - 1 };
  }
  const start = BigInt(match[1]);
  const end = match[2] ? BigInt(match[2]) : max - 1n;
  if (start >= max || end < start) return null;
  return { start: Number(start), end: Number(end >= max ? max - 1n : end) };
}
@Injectable()
export class LibraryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly store: PrivateStore,
    private readonly materials: MaterialsService,
  ) {}
  async courses() {
    const rows = await this.db.version_courses.findMany({
      where: {
        document_versions: {
          AND: [
            available(),
            {
              documents_documents_id_current_version_idTodocument_versions: {
                some: { visibility: 'VISIBLE' },
              },
            },
          ],
        },
      },
      distinct: ['course_id'],
      select: { courses: { select: { id: true, code: true, name: true } } },
      orderBy: { course_id: 'asc' },
    });
    return {
      items: rows.map(({ courses: c }) => ({ id: String(c.id), code: c.code, name: c.name })),
    };
  }
  async list(query: LibraryListDto) {
    return this.db.$transaction(
      async (tx) => {
        const where = await this.listWhere(tx, query);
        return {
          items: (
            await tx.document_versions.findMany({
              where,
              select: selection,
              orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
              skip: (query.page - 1) * query.limit,
              take: query.limit,
            })
          ).map((row) => serialize(row)),
          total: await tx.document_versions.count({ where }),
          page: query.page,
          limit: query.limit,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  private async listWhere(
    tx: Prisma.TransactionClient,
    query: LibraryListDto,
  ): Promise<Prisma.document_versionsWhereInput> {
    // Accent-insensitive title/author match ("giao trinh" finds "Giáo trình") against text folded
    // on write (version_search), limited to current approved versions; every word must appear,
    // in any order. Then narrows the regular Prisma filter by id.
    const terms = query.search ? foldedTerms(query.search) : [];
    const matches = terms.length
      ? await tx.$queryRaw<{ id: bigint }[]>`
          SELECT v.id FROM hucescholar.document_versions v
          JOIN hucescholar.documents d ON d.current_version_id = v.id
          JOIN hucescholar.version_search s ON s.version_id = v.id
          WHERE v.review_status = 'APPROVED'
            AND s.folded LIKE ALL (${terms}::text[])`
      : null;
    return {
      AND: [
        available(),
        {
          documents_documents_id_current_version_idTodocument_versions: {
            some: { visibility: 'VISIBLE', ...(query.kind ? { kind: query.kind } : {}) },
          },
          ...(query.materialType ? { material_type: query.materialType } : {}),
          ...(query.courseId
            ? { version_courses: { some: { course_id: academicId(query.courseId) } } }
            : {}),
          ...(matches ? { id: { in: matches.map((row) => row.id) } } : {}),
        },
      ],
    };
  }
  private async readable(tx: Prisma.TransactionClient, id: bigint) {
    const row = await tx.document_versions.findFirst({
      where: { AND: [{ id }, available()] },
      select: selection,
    });
    if (!row)
      throw new NotFoundException('Học liệu không còn khả dụng hoặc bạn không có quyền đọc.');
    return row;
  }
  /** Serializes rows with a pointer to each earlier version's current version, if readable. */
  private async withCurrent(tx: Prisma.TransactionClient, rows: LibraryRow[]) {
    const wanted = rows.flatMap((row) => {
      const current = row.documents_document_versions_document_idTodocuments.current_version_id;
      return current && current !== row.id ? [current] : [];
    });
    const currents = wanted.length
      ? await tx.document_versions.findMany({
          where: { AND: [{ id: { in: wanted } }, available()] },
          select: { id: true, version_no: true, title: true },
        })
      : [];
    const byId = new Map(currents.map((c) => [c.id, c]));
    return rows.map((row) => {
      const id = row.documents_document_versions_document_idTodocuments.current_version_id;
      const current = id && id !== row.id ? byId.get(id) : undefined;
      return serialize(
        row,
        current
          ? { versionId: String(current.id), versionNo: current.version_no, title: current.title }
          : null,
      );
    });
  }
  async get(rawId: string) {
    return this.db.$transaction(
      async (tx) => ({
        item: (await this.withCurrent(tx, [await this.readable(tx, academicId(rawId))]))[0],
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async readableItems(tx: Prisma.TransactionClient, ids: bigint[]) {
    const rows = await tx.document_versions.findMany({
      where: { AND: [{ id: { in: ids } }, available()] },
      select: selection,
    });
    return new Map((await this.withCurrent(tx, rows)).map((item) => [item.versionId, item]));
  }
  async file(
    actor: Profile,
    rawId: string,
    download: boolean,
    range: string | undefined,
    response: Response,
    original = false,
  ) {
    const id = academicId(rawId);
    // Document-first locks serialize new grants with hide/version decisions; checked bytes already granted cannot be recalled.
    const file = await this.db.$transaction(async (tx) => {
      const row = await this.access(tx, actor, id);
      if (download && !row.download_allowed)
        throw new ForbiddenException({
          code: 'DOWNLOAD_NOT_ALLOWED',
          message: 'Nguồn tài liệu chỉ cho phép đọc trong hệ thống.',
        });
      if (original) {
        const source = await tx.document_source_uploads.findFirst({
          where: {
            current_versions: { some: { id } },
            scan_status: 'SAFE',
            conversion_status: 'READY',
            rendered_file_id: row.files!.id,
          },
        });
        if (!source) throw new NotFoundException('Phiên bản này không có Word gốc khả dụng.');
        return source;
      }
      return await tx.files.findUniqueOrThrow({ where: { id: row.files!.id } });
    });
    const size = Number(file.byte_size);
    response.setHeader('Accept-Ranges', 'bytes');
    const selected = range ? byteRange(range, size) : undefined;
    if (selected === null) {
      response.status(416);
      response.setHeader('Content-Range', `bytes */${size}`);
      response.setHeader('Content-Length', '0');
      return new StreamableFile(Buffer.alloc(0));
    }
    try {
      const stream = original
        ? await this.store.readSource(file.object_key, selected)
        : await this.store.read(file.object_key, selected);
      const disconnect = () => stream.destroy();
      response.once('close', disconnect);
      stream.once('close', () => response.off('close', disconnect));
      if (response.destroyed) {
        stream.destroy();
        return new StreamableFile(Buffer.alloc(0));
      }
      if ('pending' in stream && stream.pending) await once(stream, 'open');
      if (selected) {
        response.status(206);
        response.setHeader('Content-Range', `bytes ${selected.start}-${selected.end}/${size}`);
      }
      return new StreamableFile(stream, {
        type: original ? DOCX_MIME : 'application/pdf',
        disposition: original
          ? `attachment; filename="material.docx"; filename*=UTF-8''${encodeURIComponent(file.original_name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`
          : `${download ? 'attachment' : 'inline'}; filename="material.pdf"`,
        length: selected ? selected.end - selected.start + 1 : size,
      });
    } catch (error) {
      if (error instanceof MissingObjectError) throw fileMissing(file.id);
      throw new ServiceUnavailableException('Chưa mở được PDF. Kiểm tra kết nối rồi thử lại.');
    }
  }

  async draftPreview(actor: Profile, rawId: string, response: Response) {
    const file = await this.db.$transaction(async (tx) => {
      const { row } = await this.materials.lockDraft(tx, actor, rawId);
      const file = row.file_id ? await tx.files.findUnique({ where: { id: row.file_id } }) : null;
      if (
        !file ||
        file.scan_status !== 'SAFE' ||
        (row.source_upload && row.source_upload.conversion_status !== 'READY')
      )
        throw new NotFoundException('Bản đọc chưa sẵn sàng.');
      return file;
    });
    try {
      const stream = await this.store.read(file.object_key);
      response.once('close', () => stream.destroy());
      if ('pending' in stream && stream.pending) await once(stream, 'open');
      return new StreamableFile(stream, {
        type: 'application/pdf',
        disposition: 'inline; filename="preview.pdf"',
        length: Number(file.byte_size),
      });
    } catch (error) {
      if (error instanceof MissingObjectError) throw fileMissing(file.id);
      throw new ServiceUnavailableException('Chưa mở được bản đọc.');
    }
  }

  // Keep actor locks shared: moderation also shares the manager after locking its document.
  async access(tx: Prisma.TransactionClient, actor: Profile, id: bigint) {
    const actorId = academicId(actor.id);
    await tx.$queryRaw`SELECT id FROM hucescholar.users WHERE id=${actorId} FOR SHARE`;
    const user = await tx.users.findUnique({ where: { id: actorId } });
    if (!user || user.status !== 'ACTIVE' || !user.verified_at)
      throw new ForbiddenException('Tài khoản không còn quyền đọc.');
    const target = await tx.document_versions.findUnique({
      where: { id },
      select: { document_id: true, file_id: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy học liệu.');
    await tx.$queryRaw`SELECT id FROM hucescholar.documents WHERE id=${target.document_id} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM hucescholar.document_versions WHERE id=${id} FOR SHARE`;
    if (target.file_id)
      await tx.$queryRaw`SELECT id FROM hucescholar.files WHERE id=${target.file_id} FOR SHARE`;
    return this.readable(tx, id);
  }
}
