import { AnnotationSearchDto } from './annotation-search.dto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { Prisma, type annotations, type reading_progress } from '../generated/prisma/client';
import { academicId } from '../academic/academic.service';
import { Profile } from '../auth/auth.types';
import { LibraryService } from './library.service';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { CreateHighlightDto, UpdateHighlightDto } from './highlight.dto';
import { exportAnnotations, MAX_EXPORT_ANNOTATIONS, type ExportFormat } from './annotation-export';
import {
  CreateNoteDto,
  NotesQueryDto,
  ReadingRevisionDto,
  SaveProgressDto,
  UpdateNoteDto,
} from './reading.dto';
const noteItem = (n: annotations) => ({
  id: String(n.id),
  versionId: String(n.version_id),
  pageNumber: n.page_number,
  kind: n.kind,
  content: n.content,
  revision: n.revision,
  updatedAt: n.updated_at.toISOString(),
  ...(n.kind === 'TEXT_HIGHLIGHT' ? { anchor: n.anchor, color: n.color } : {}),
});
const progressItem = (p: reading_progress | null) =>
  p
    ? {
        versionId: String(p.version_id),
        pageNumber: p.page_number,
        revision: p.revision,
        updatedAt: p.updated_at.toISOString(),
      }
    : null;
const stale = () =>
  new ConflictException({
    code: 'READING_CONFLICT',
    message: 'Dữ liệu đã thay đổi ở lượt khác. Tải lại trước khi cập nhật.',
  });
function pageWithin(page: number, count: number | null) {
  if (!count || page > count) throw new BadRequestException('Trang nằm ngoài tài liệu.');
}
@Injectable()
export class ReadingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly library: LibraryService,
  ) {}
  private run<T>(
    actor: Profile,
    rawId: string,
    writing: boolean,
    action: (
      tx: Prisma.TransactionClient,
      owner: bigint,
      version: bigint,
      pages: number | null,
      textLayer: boolean | null,
      copyRestricted: boolean,
    ) => Promise<T>,
  ) {
    const owner = academicId(actor.id),
      version = academicId(rawId);
    return this.db.$transaction(async (tx) => {
      // Serialize personal mutations (including first inserts) without exclusively
      // locking users, which would invert moderation's document -> manager lock order.
      if (writing)
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`hucescholar:reading:${owner}`}, 0))`;
      const row = await this.library.access(tx, actor, version);
      const file = row.files!;
      return action(tx, owner, version, file.page_count, file.has_text_layer, file.copy_restricted);
    });
  }
  notes(actor: Profile, id: string, query: NotesQueryDto) {
    return this.list(actor, id, query, 'PAGE_NOTE');
  }
  highlights(actor: Profile, id: string, query: NotesQueryDto) {
    return this.list(actor, id, query, 'TEXT_HIGHLIGHT');
  }
  search(actor: Profile, id: string, query: AnnotationSearchDto) {
    return this.run(actor, id, false, async (tx, owner, version, pages) => {
      if (query.kind === 'PAGE_NOTE' && query.color)
        throw new BadRequestException('Màu chỉ áp dụng cho đoạn tô.');
      const kind = query.color ? 'TEXT_HIGHLIGHT' : query.kind;
      const term = query.query ?? '';
      const fingerprint = createHash('sha256')
        .update(JSON.stringify([kind ?? null, query.color ?? null, term]))
        .digest('base64url');
      const prefix = [1, String(owner), String(version)];
      let after: { page: number; id: bigint } | undefined;
      if (query.cursor) {
        try {
          const decoded = Buffer.from(query.cursor, 'base64url');
          const tuple: unknown = JSON.parse(decoded.toString('utf8'));
          if (
            decoded.toString('base64url') !== query.cursor ||
            !Array.isArray(tuple) ||
            tuple.length !== 6 ||
            !prefix.every((value, index) => tuple[index] === value) ||
            !Number.isInteger(tuple[3]) ||
            tuple[3] < 1 ||
            tuple[3] > (pages ?? 0) ||
            typeof tuple[4] !== 'string' ||
            tuple[5] !== fingerprint
          )
            throw new Error('Invalid cursor');
          after = { page: tuple[3] as number, id: academicId(tuple[4]) };
        } catch {
          throw new BadRequestException('Lượt tải tiếp không hợp lệ. Tìm lại từ đầu.');
        }
      }
      const limit = query.limit ?? 20;
      // Treat SQL wildcard characters as literal text, including the escape character itself.
      const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
      const rows = await tx.$queryRaw<annotations[]>(Prisma.sql`
        SELECT * FROM hucescholar.annotations
        WHERE user_id = ${owner} AND version_id = ${version}
          ${kind ? Prisma.sql`AND kind = ${kind}` : Prisma.empty}
          ${query.color ? Prisma.sql`AND color = ${query.color}` : Prisma.empty}
          ${term ? Prisma.sql`AND (content ILIKE ${pattern} ESCAPE ${'\\'} OR anchor->>'quote' ILIKE ${pattern} ESCAPE ${'\\'})` : Prisma.empty}
          ${after ? Prisma.sql`AND (page_number, id) > (${after.page}, ${after.id})` : Prisma.empty}
        ORDER BY page_number ASC, id ASC LIMIT ${limit + 1}
      `);
      const items = rows.slice(0, limit),
        last = items.at(-1);
      return {
        items: items.map(noteItem),
        nextCursor:
          rows.length > limit && last
            ? Buffer.from(
                JSON.stringify([...prefix, last.page_number, String(last.id), fingerprint]),
              ).toString('base64url')
            : null,
      };
    });
  }
  private list(actor: Profile, id: string, query: NotesQueryDto, kind: string) {
    const cursor = query.cursor ? academicId(query.cursor) : undefined;
    return this.run(actor, id, false, async (tx, user_id, version_id, pages) => {
      pageWithin(query.pageNumber, pages);
      const rows = await tx.annotations.findMany({
        where: {
          user_id,
          version_id,
          page_number: query.pageNumber,
          kind,
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: { id: 'desc' },
        take: 31,
      });
      return {
        items: rows.slice(0, 30).map(noteItem),
        nextCursor: rows.length > 30 ? String(rows[29].id) : null,
      };
    });
  }
  create(actor: Profile, id: string, dto: CreateNoteDto) {
    return this.createAnnotation(actor, id, dto);
  }
  createHighlight(actor: Profile, id: string, dto: CreateHighlightDto) {
    return this.createAnnotation(actor, id, dto);
  }
  private createAnnotation(actor: Profile, id: string, dto: CreateNoteDto | CreateHighlightDto) {
    const highlight = 'anchor' in dto;
    const kind = highlight ? 'TEXT_HIGHLIGHT' : 'PAGE_NOTE';
    const anchor = highlight ? { ...dto.anchor, quote: dto.anchor.quote.trim() } : null;
    return this.run(
      actor,
      id,
      true,
      async (tx, user_id, version_id, pages, textLayer, copyRestricted) => {
        pageWithin(dto.pageNumber, pages);
        const existing = await tx.annotations.findUnique({
          where: { user_id_request_id: { user_id, request_id: dto.requestId } },
        });
        if (existing) {
          if (
            existing.version_id !== version_id ||
            existing.page_number !== dto.pageNumber ||
            existing.kind !== kind ||
            existing.content !== dto.content ||
            (highlight &&
              (existing.color !== dto.color || !isDeepStrictEqual(existing.anchor, anchor)))
          )
            throw new ConflictException({
              code: 'NOTE_REQUEST_REUSED',
              message: 'Yêu cầu ghi chú đã được dùng. Tải lại để đối soát.',
            });
          return { item: noteItem(existing) };
        }
        if (highlight && !textLayer)
          throw new BadRequestException(
            'Trang scan chưa hỗ trợ tô chữ. Hãy dùng ghi chú theo trang.',
          );
        // The quote copies text out of the PDF, which its author forbade.
        if (highlight && copyRestricted)
          throw new BadRequestException({
            code: 'COPY_RESTRICTED',
            message: 'PDF này không cho phép sao chép nội dung. Hãy dùng ghi chú theo trang.',
          });
        const item = await tx.annotations.create({
          data: {
            user_id,
            version_id,
            request_id: dto.requestId,
            page_number: dto.pageNumber,
            kind,
            content: dto.content,
            ...(highlight ? { anchor: anchor as Prisma.InputJsonValue, color: dto.color } : {}),
          },
        });
        return { item: noteItem(item) };
      },
    );
  }
  private async owned(
    tx: Prisma.TransactionClient,
    owner: bigint,
    version: bigint,
    id: bigint,
    revision: number,
    kind = 'PAGE_NOTE',
  ) {
    const note = await tx.annotations.findFirst({
      where: { id, user_id: owner, version_id: version, kind },
    });
    if (!note) throw new NotFoundException('Không tìm thấy ghi chú.');
    if (note.revision !== revision) throw stale();
    return note;
  }
  update(actor: Profile, id: string, noteId: string, dto: UpdateNoteDto) {
    const target = academicId(noteId);
    return this.run(actor, id, true, async (tx, owner, version) => {
      await this.owned(tx, owner, version, target, dto.revision);
      return {
        item: noteItem(
          await tx.annotations.update({
            where: { id: target },
            data: { content: dto.content, revision: { increment: 1 }, updated_at: new Date() },
          }),
        ),
      };
    });
  }
  updateHighlight(actor: Profile, id: string, noteId: string, dto: UpdateHighlightDto) {
    const target = academicId(noteId);
    return this.run(actor, id, true, async (tx, owner, version) => {
      await this.owned(tx, owner, version, target, dto.revision, 'TEXT_HIGHLIGHT');
      return {
        item: noteItem(
          await tx.annotations.update({
            where: { id: target },
            data: {
              content: dto.content,
              color: dto.color,
              revision: { increment: 1 },
              updated_at: new Date(),
            },
          }),
        ),
      };
    });
  }
  remove(actor: Profile, id: string, noteId: string, dto: ReadingRevisionDto, kind = 'PAGE_NOTE') {
    const target = academicId(noteId);
    return this.run(actor, id, true, async (tx, owner, version) => {
      await this.owned(tx, owner, version, target, dto.revision, kind);
      await tx.annotations.delete({ where: { id: target } });
    });
  }
  progress(actor: Profile, id: string) {
    return this.run(actor, id, false, async (tx, user_id, version_id) => ({
      item: progressItem(
        await tx.reading_progress.findUnique({
          where: { user_id_version_id: { user_id, version_id } },
        }),
      ),
    }));
  }
  saveProgress(actor: Profile, id: string, dto: SaveProgressDto) {
    return this.run(actor, id, true, async (tx, user_id, version_id, pages) => {
      pageWithin(dto.pageNumber, pages);
      const where = { user_id_version_id: { user_id, version_id } };
      const current = await tx.reading_progress.findUnique({ where });
      if ((current?.revision ?? 0) !== dto.revision) throw stale();
      const row = current
        ? await tx.reading_progress.update({
            where,
            data: {
              page_number: dto.pageNumber,
              page_offset: 0,
              revision: { increment: 1 },
              updated_at: new Date(),
            },
          })
        : await tx.reading_progress.create({
            data: { user_id, version_id, page_number: dto.pageNumber, page_offset: 0 },
          });
      return { item: progressItem(row) };
    });
  }
  /** Everything the owner wrote on this version, while they can still read it. */
  exportNotes(actor: Profile, id: string, format: ExportFormat) {
    return this.run(actor, id, false, async (tx, user_id, version_id) => {
      const rows = await tx.annotations.findMany({
        where: { user_id, version_id },
        select: { page_number: true, kind: true, content: true, anchor: true, color: true },
        orderBy: [{ page_number: 'asc' }, { id: 'asc' }],
        take: MAX_EXPORT_ANNOTATIONS + 1,
      });
      if (rows.length > MAX_EXPORT_ANNOTATIONS)
        throw new BadRequestException({
          code: 'EXPORT_TOO_LARGE',
          message: `Phiên bản có hơn ${MAX_EXPORT_ANNOTATIONS} ghi chú; chưa xuất được một lần.`,
        });
      const version = await tx.document_versions.findUniqueOrThrow({
        where: { id: version_id },
        select: { title: true, authors: true, version_no: true },
      });
      return exportAnnotations(
        {
          title: version.title,
          authors: version.authors,
          versionNo: version.version_no,
          exportedAt: new Date(),
        },
        rows,
        format,
      );
    });
  }
}
