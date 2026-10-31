import { AnnotationSearchDto } from './annotation-search.dto';
import { annotationFilter, decodeCursor, encodeCursor } from './annotation-query';
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
import { CreateHighlightDto, UpdateHighlightDto } from './highlight.dto';
import { exportAnnotations, MAX_EXPORT_ANNOTATIONS, type ExportFormat } from './annotation-export';
import {
  CreateNoteDto,
  NotesQueryDto,
  ReadingRevisionDto,
  NotePosition,
  ReviewLaterDto,
  SaveProgressDto,
  UpdateNoteDto,
} from './reading.dto';
const pinAnchor = (p: NotePosition) => ({
  coordinateSpace: 'normalized-pdf-v1',
  point: [Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6],
});
function notePosition(anchor: unknown): NotePosition | null {
  if (!anchor || typeof anchor !== 'object' || !('point' in anchor)) return null;
  const point = anchor.point;
  return Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number'
    ? { x: point[0], y: point[1] }
    : null;
}
export const noteItem = (n: annotations) => ({
  id: String(n.id),
  versionId: String(n.version_id),
  pageNumber: n.page_number,
  kind: n.kind,
  content: n.content,
  revision: n.revision,
  updatedAt: n.updated_at.toISOString(),
  reviewLater: n.review_later,
  ...(n.kind === 'TEXT_HIGHLIGHT'
    ? { anchor: n.anchor, color: n.color }
    : { position: notePosition(n.anchor) }),
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
      const filter = annotationFilter(query);
      const head = [1, String(owner), String(version)];
      const after = query.cursor
        ? decodeCursor(query.cursor, head, 2, filter.fingerprint, ([page, id]) =>
            Number.isInteger(page) &&
            (page as number) >= 1 &&
            (page as number) <= (pages ?? 0) &&
            typeof id === 'string'
              ? { page: page as number, id: academicId(id) }
              : null,
          )
        : undefined;
      const limit = query.limit ?? 20;
      const rows = await tx.$queryRaw<annotations[]>(Prisma.sql`
        SELECT * FROM hucescholar.annotations
        WHERE user_id = ${owner} AND version_id = ${version} ${filter.sql}
          ${after ? Prisma.sql`AND (page_number, id) > (${after.page}, ${after.id})` : Prisma.empty}
        ORDER BY page_number ASC, id ASC LIMIT ${limit + 1}
      `);
      const items = rows.slice(0, limit),
        last = items.at(-1);
      return {
        items: items.map(noteItem),
        nextCursor:
          rows.length > limit && last
            ? encodeCursor(head, [last.page_number, String(last.id)], filter.fingerprint)
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
    const anchor = highlight
      ? { ...dto.anchor, quote: dto.anchor.quote.trim() }
      : dto.position
        ? pinAnchor(dto.position)
        : null;
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
            (highlight && existing.color !== dto.color) ||
            !isDeepStrictEqual(existing.anchor ?? null, anchor)
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
            ...(anchor ? { anchor: anchor as Prisma.InputJsonValue } : {}),
            ...(highlight ? { color: dto.color } : {}),
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
            data: {
              content: dto.content,
              ...(dto.position === undefined
                ? {}
                : { anchor: dto.position ? pinAnchor(dto.position) : Prisma.DbNull }),
              revision: { increment: 1 },
              updated_at: new Date(),
            },
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
  /**
   * Sets (not toggles) the owner's private "Cần xem lại" mark, so a retry is harmless.
   * Content revision is untouched: marking from the notebook must not stale an open draft.
   */
  setReviewLater(actor: Profile, id: string, noteId: string, dto: ReviewLaterDto) {
    const target = academicId(noteId);
    return this.run(actor, id, true, async (tx, user_id, version_id) => {
      const { count } = await tx.annotations.updateMany({
        where: { id: target, user_id, version_id },
        data: { review_later: dto.reviewLater },
      });
      if (!count) throw new NotFoundException('Không tìm thấy ghi chú.');
      return { item: noteItem(await tx.annotations.findUniqueOrThrow({ where: { id: target } })) };
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
        select: {
          page_number: true,
          kind: true,
          content: true,
          anchor: true,
          color: true,
          review_later: true,
        },
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
