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
      return action(tx, owner, version, row.files!.page_count, row.files!.has_text_layer);
    });
  }
  notes(actor: Profile, id: string, query: NotesQueryDto) {
    return this.list(actor, id, query, 'PAGE_NOTE');
  }
  highlights(actor: Profile, id: string, query: NotesQueryDto) {
    return this.list(actor, id, query, 'TEXT_HIGHLIGHT');
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
    return this.run(actor, id, true, async (tx, user_id, version_id, pages, textLayer) => {
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
    });
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
}
