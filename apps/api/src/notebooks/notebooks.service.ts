import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { academicId } from '../academic/academic.service';
import { Profile } from '../auth/auth.types';
import { DatabaseService } from '../database/database.module';
import { Prisma, type notebook_pages, type notebooks } from '../generated/prisma/client';
import { available } from '../materials/library.service';
import { foldVietnamese } from '../materials/search-fold';
import { cleanPage, type PageContent, type PageItem, type PageSize } from './notebook-content';
import {
  AddQuotesDto,
  CreateNotebookDto,
  CreatePageDto,
  DuplicateNotebookDto,
  NotebookListDto,
  NotebookRevisionDto,
  ReorderPagesDto,
  UpdateNotebookDto,
  UpdatePageDto,
} from './notebooks.dto';

export const MAX_NOTEBOOKS = 200;
export const MAX_PAGES = 500;
export const TRASH_DAYS = 30;
/** Page sizes in CSS pixels at 96 dpi (A4 = 210 × 297 mm). */
export const PAGE_BOX: Record<PageSize, { w: number; h: number }> = {
  A4_PORTRAIT: { w: 794, h: 1123 },
  A4_LANDSCAPE: { w: 1123, h: 794 },
  // An infinite page has no edge; quote cards are laid out as on a portrait sheet.
  INFINITE: { w: 794, h: 1123 },
};

const notFound = () =>
  new NotFoundException({ code: 'NOTEBOOK_NOT_FOUND', message: 'Không tìm thấy vở ghi.' });
const pageNotFound = () =>
  new NotFoundException({ code: 'NOTEBOOK_PAGE_NOT_FOUND', message: 'Không tìm thấy trang vở.' });
const staleNotebook = () =>
  new ConflictException({
    code: 'NOTEBOOK_CONFLICT',
    message: 'Vở đã thay đổi ở nơi khác. Tải lại trước khi sửa.',
  });
const quota = (message: string) => new HttpException({ code: 'NOTEBOOK_QUOTA', message }, 413);

type Summary = notebooks & {
  courses: { id: bigint; code: string; name: string } | null;
};
const pageSummary = (p: notebook_pages) => ({
  id: String(p.id),
  position: p.position,
  size: p.size,
  paper: p.paper,
  paperColor: p.paper_color,
  revision: p.revision,
  updatedAt: p.updated_at.toISOString(),
});
function notebookItem(n: Summary, pageCount: number, firstPageId: string | null) {
  return {
    id: String(n.id),
    title: n.title,
    cover: n.cover,
    course: n.courses
      ? { id: String(n.courses.id), code: n.courses.code, name: n.courses.name }
      : null,
    defaultSize: n.default_size,
    defaultPaper: n.default_paper,
    defaultColor: n.default_color,
    revision: n.revision,
    pageCount,
    firstPageId,
    createdAt: n.created_at.toISOString(),
    updatedAt: n.updated_at.toISOString(),
    deletedAt: n.deleted_at?.toISOString() ?? null,
  };
}
export type QuoteView =
  | {
      available: true;
      kind: string;
      quote: string;
      note: string;
      color: string;
      versionId: string;
      pageNumber: number;
      title: string;
    }
  | { available: false };

/**
 * CANVAS-01 "Vở ghi". Every notebook, page and image belongs to one user and only that user's
 * session reaches it: any other id answers 404, admins included, like private notes.
 */
@Injectable()
export class NotebooksService {
  constructor(private readonly db: DatabaseService) {}

  private async lockUser(tx: Prisma.TransactionClient, userId: bigint) {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`hucescholar:notebook:${userId}`}, 0))`;
  }
  /** The owner's notebook, locked for the transaction; trashed ones only when asked for. */
  private async owned(tx: Prisma.TransactionClient, userId: bigint, rawId: string, trash = false) {
    const id = academicId(rawId);
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM hucescholar.notebooks
      WHERE id = ${id} AND user_id = ${userId}
        AND ${trash ? Prisma.sql`deleted_at IS NOT NULL` : Prisma.sql`deleted_at IS NULL`}
      FOR UPDATE`;
    if (!rows.length) throw notFound();
    return tx.notebooks.findUniqueOrThrow({ where: { id } });
  }
  private async touch(tx: Prisma.TransactionClient, id: bigint) {
    await tx.notebooks.update({ where: { id }, data: { updated_at: new Date() } });
  }
  private async course(tx: Prisma.TransactionClient, raw: string | null) {
    if (raw === null) return null;
    const course = await tx.courses.findUnique({ where: { id: academicId(raw) } });
    if (!course)
      throw new BadRequestException({
        code: 'NOTEBOOK_INVALID',
        message: 'Môn học không tồn tại.',
      });
    return course.id;
  }
  private async items(tx: Prisma.TransactionClient, rows: Summary[]) {
    const ids = rows.map((r) => r.id);
    const counts = ids.length
      ? await tx.notebook_pages.groupBy({
          by: ['notebook_id'],
          where: { notebook_id: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const firsts = ids.length
      ? await tx.notebook_pages.findMany({
          where: { notebook_id: { in: ids } },
          select: { id: true, notebook_id: true, position: true },
          orderBy: [{ notebook_id: 'asc' }, { position: 'asc' }],
          distinct: ['notebook_id'],
        })
      : [];
    const count = new Map(counts.map((c) => [c.notebook_id, c._count._all]));
    const first = new Map(firsts.map((f) => [f.notebook_id, String(f.id)]));
    return rows.map((r) => notebookItem(r, count.get(r.id) ?? 0, first.get(r.id) ?? null));
  }
  private async detail(tx: Prisma.TransactionClient, id: bigint) {
    const row = await tx.notebooks.findUniqueOrThrow({
      where: { id },
      include: { courses: { select: { id: true, code: true, name: true } } },
    });
    const pages = await tx.notebook_pages.findMany({
      where: { notebook_id: id },
      orderBy: { position: 'asc' },
    });
    return {
      item: notebookItem(row, pages.length, pages[0] ? String(pages[0].id) : null),
      pages: pages.map(pageSummary),
    };
  }

  async list(actor: Profile, query: NotebookListDto) {
    const userId = academicId(actor.id);
    const trash = query.trash === '1';
    const words = (query.q ?? '').normalize('NFC').split(/\s+/).filter(Boolean).slice(0, 8);
    let matching: bigint[] | null = null;
    if (words.length) {
      // Every word must appear in the title or in some page's typed text; without diacritics it
      // matches with or without them, as in the library and the Sổ tay (SEARCH-01, LEARN-03c).
      const literal = (value: string) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;
      const match = (column: Prisma.Sql, word: string) =>
        foldVietnamese(word) === word.toLowerCase()
          ? Prisma.sql`hucescholar.fold_vi(normalize(${column}, NFC)) LIKE ${literal(foldVietnamese(word))} ESCAPE ${'\\'}`
          : Prisma.sql`normalize(${column}, NFC) ILIKE ${literal(word)} ESCAPE ${'\\'}`;
      const conditions = words.map(
        (word) => Prisma.sql`(${match(Prisma.sql`n.title`, word)} OR EXISTS (
          SELECT 1 FROM hucescholar.notebook_pages p
          WHERE p.notebook_id = n.id AND ${match(Prisma.sql`p.search_text`, word)}))`,
      );
      matching = (
        await this.db.$queryRaw<{ id: bigint }[]>`
          SELECT n.id FROM hucescholar.notebooks n
          WHERE n.user_id = ${userId} AND ${Prisma.join(conditions, ' AND ')}`
      ).map((r) => r.id);
    }
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.notebooks.findMany({
          where: {
            user_id: userId,
            deleted_at: trash ? { not: null } : null,
            ...(query.courseId ? { course_id: academicId(query.courseId) } : {}),
            ...(matching ? { id: { in: matching } } : {}),
          },
          include: { courses: { select: { id: true, code: true, name: true } } },
          orderBy: trash
            ? [{ deleted_at: 'desc' }, { id: 'desc' }]
            : [{ updated_at: 'desc' }, { id: 'desc' }],
          take: MAX_NOTEBOOKS,
        });
        const courses = await tx.courses.findMany({
          where: { notebooks: { some: { user_id: userId, deleted_at: null } } },
          select: { id: true, code: true, name: true },
          orderBy: { code: 'asc' },
        });
        return {
          items: await this.items(tx, rows),
          courses: courses.map((c) => ({ id: String(c.id), code: c.code, name: c.name })),
          trashDays: TRASH_DAYS,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async create(actor: Profile, body: CreateNotebookDto) {
    const userId = academicId(actor.id);
    return this.db.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const existing = await tx.notebooks.findUnique({
        where: { user_id_request_id: { user_id: userId, request_id: body.requestId } },
      });
      if (existing) {
        if (existing.title !== body.title)
          throw new ConflictException({
            code: 'NOTEBOOK_REQUEST_REUSED',
            message: 'Yêu cầu tạo vở đã được dùng. Tải lại để đối soát.',
          });
        return this.detail(tx, existing.id);
      }
      if ((await tx.notebooks.count({ where: { user_id: userId } })) >= MAX_NOTEBOOKS)
        throw quota(`Mỗi người có tối đa ${MAX_NOTEBOOKS} vở (tính cả vở trong thùng rác).`);
      const notebook = await tx.notebooks.create({
        data: {
          request_id: body.requestId,
          user_id: userId,
          title: body.title,
          cover: body.cover,
          course_id: await this.course(tx, body.courseId),
          default_size: body.defaultSize,
          default_paper: body.defaultPaper,
          default_color: body.defaultColor,
        },
      });
      await tx.notebook_pages.create({
        data: {
          request_id: randomUUID(),
          notebook_id: notebook.id,
          position: 0,
          size: body.defaultSize,
          paper: body.defaultPaper,
          paper_color: body.defaultColor,
        },
      });
      return this.detail(tx, notebook.id);
    });
  }

  async get(actor: Profile, rawId: string) {
    const userId = academicId(actor.id);
    return this.db.$transaction(
      async (tx) => {
        const id = academicId(rawId);
        const row = await tx.notebooks.findFirst({
          where: { id, user_id: userId, deleted_at: null },
        });
        if (!row) throw notFound();
        return this.detail(tx, id);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async update(actor: Profile, rawId: string, body: UpdateNotebookDto) {
    const userId = academicId(actor.id);
    return this.db.$transaction(async (tx) => {
      const row = await this.owned(tx, userId, rawId);
      if (row.revision !== body.revision) throw staleNotebook();
      await tx.notebooks.update({
        where: { id: row.id },
        data: {
          title: body.title,
          cover: body.cover,
          course_id: await this.course(tx, body.courseId),
          default_size: body.defaultSize,
          default_paper: body.defaultPaper,
          default_color: body.defaultColor,
          revision: { increment: 1 },
          updated_at: new Date(),
        },
      });
      return this.detail(tx, row.id);
    });
  }

  /** Moves a notebook to the trash; the worker deletes it for good after 30 days. */
  async trash(actor: Profile, rawId: string, body: NotebookRevisionDto) {
    const userId = academicId(actor.id);
    await this.db.$transaction(async (tx) => {
      const row = await this.owned(tx, userId, rawId);
      if (row.revision !== body.revision) throw staleNotebook();
      await tx.notebooks.update({
        where: { id: row.id },
        data: { deleted_at: new Date(), revision: { increment: 1 } },
      });
    });
  }
  async restore(actor: Profile, rawId: string) {
    const userId = academicId(actor.id);
    return this.db.$transaction(async (tx) => {
      const row = await this.owned(tx, userId, rawId, true);
      await tx.notebooks.update({
        where: { id: row.id },
        data: { deleted_at: null, revision: { increment: 1 }, updated_at: new Date() },
      });
      return this.detail(tx, row.id);
    });
  }
  /** "Xóa vĩnh viễn" from the trash. Images no page uses any more are removed by the worker. */
  async purge(actor: Profile, rawId: string) {
    const userId = academicId(actor.id);
    await this.db.$transaction(async (tx) => {
      const row = await this.owned(tx, userId, rawId, true);
      await tx.notebooks.delete({ where: { id: row.id } });
    });
  }

  async duplicate(actor: Profile, rawId: string, body: DuplicateNotebookDto) {
    const userId = academicId(actor.id);
    return this.db.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const existing = await tx.notebooks.findUnique({
        where: { user_id_request_id: { user_id: userId, request_id: body.requestId } },
      });
      if (existing) return this.detail(tx, existing.id);
      const source = await this.owned(tx, userId, rawId);
      if ((await tx.notebooks.count({ where: { user_id: userId } })) >= MAX_NOTEBOOKS)
        throw quota(`Mỗi người có tối đa ${MAX_NOTEBOOKS} vở (tính cả vở trong thùng rác).`);
      const suffix = ' (bản sao)';
      const copy = await tx.notebooks.create({
        data: {
          request_id: body.requestId,
          user_id: userId,
          title: source.title.slice(0, 120 - suffix.length) + suffix,
          cover: source.cover,
          course_id: source.course_id,
          default_size: source.default_size,
          default_paper: source.default_paper,
          default_color: source.default_color,
        },
      });
      const pages = await tx.notebook_pages.findMany({
        where: { notebook_id: source.id },
        orderBy: { position: 'asc' },
      });
      // Images are the owner's own assets and are shared by both copies, not copied.
      await tx.notebook_pages.createMany({
        data: pages.map((p) => ({
          request_id: randomUUID(),
          notebook_id: copy.id,
          position: p.position,
          size: p.size,
          paper: p.paper,
          paper_color: p.paper_color,
          content: p.content as Prisma.InputJsonValue,
          search_text: p.search_text,
        })),
      });
      return this.detail(tx, copy.id);
    });
  }

  // ---- Pages -------------------------------------------------------------------------------

  private async page(tx: Prisma.TransactionClient, notebookId: bigint, rawPageId: string) {
    const page = await tx.notebook_pages.findFirst({
      where: { id: academicId(rawPageId), notebook_id: notebookId },
    });
    if (!page) throw pageNotFound();
    return page;
  }

  /** The owner's quotes as they read now: hidden when the document is no longer readable. */
  async quotes(tx: Prisma.TransactionClient, userId: bigint, ids: string[]) {
    const result: Record<string, QuoteView> = {};
    if (!ids.length) return result;
    const user = await tx.users.findUnique({ where: { id: userId } });
    const rows =
      user && user.status === 'ACTIVE' && user.verified_at
        ? await tx.annotations.findMany({
            where: {
              id: { in: ids.map((id) => BigInt(id)) },
              user_id: userId,
              document_versions: available(),
            },
            include: { document_versions: { select: { title: true } } },
          })
        : [];
    for (const id of ids) result[id] = { available: false };
    for (const row of rows) {
      const anchor = row.anchor as { quote?: unknown } | null;
      const highlight = row.kind === 'TEXT_HIGHLIGHT';
      result[String(row.id)] = {
        available: true,
        kind: row.kind,
        quote: highlight && typeof anchor?.quote === 'string' ? anchor.quote : '',
        note: row.content,
        color: row.color,
        versionId: String(row.version_id),
        pageNumber: row.page_number,
        title: row.document_versions.title,
      };
    }
    return result;
  }
  private async assets(tx: Prisma.TransactionClient, userId: bigint, ids: string[]) {
    const result: Record<string, { status: string; width: number; height: number }> = {};
    if (!ids.length) return result;
    const rows = await tx.notebook_assets.findMany({
      where: { id: { in: ids.map((id) => BigInt(id)) }, user_id: userId },
    });
    for (const row of rows)
      result[String(row.id)] = { status: row.scan_status, width: row.width, height: row.height };
    return result;
  }
  private async pageView(tx: Prisma.TransactionClient, userId: bigint, page: notebook_pages) {
    const content = page.content as PageContent;
    const items = Array.isArray(content?.items) ? content.items : [];
    const quoteIds = items.flatMap((i) => (i.type === 'quote' ? [i.annotationId] : []));
    const assetIds = items.flatMap((i) => (i.type === 'image' ? [i.assetId] : []));
    return {
      page: { ...pageSummary(page), content },
      quotes: await this.quotes(tx, userId, [...new Set(quoteIds)]),
      assets: await this.assets(tx, userId, [...new Set(assetIds)]),
    };
  }

  async getPage(actor: Profile, rawId: string, rawPageId: string) {
    const userId = academicId(actor.id);
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.notebooks.findFirst({
          where: { id: academicId(rawId), user_id: userId, deleted_at: null },
        });
        if (!row) throw notFound();
        return this.pageView(tx, userId, await this.page(tx, row.id, rawPageId));
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  /** Opens a gap at `position` (or appends) and returns the position to use. */
  private async slot(
    tx: Prisma.TransactionClient,
    notebookId: bigint,
    afterPageId: string | null | undefined,
  ) {
    const count = await tx.notebook_pages.count({ where: { notebook_id: notebookId } });
    if (count >= MAX_PAGES) throw quota(`Một vở có tối đa ${MAX_PAGES} trang.`);
    let position = count;
    if (afterPageId === null) position = 0;
    else if (afterPageId !== undefined)
      position = (await this.page(tx, notebookId, afterPageId)).position + 1;
    if (position < count)
      await tx.notebook_pages.updateMany({
        where: { notebook_id: notebookId, position: { gte: position } },
        data: { position: { increment: 1 } },
      });
    return position;
  }

  async createPage(actor: Profile, rawId: string, body: CreatePageDto) {
    const userId = academicId(actor.id);
    return this.db.$transaction(async (tx) => {
      const notebook = await this.owned(tx, userId, rawId);
      const existing = await tx.notebook_pages.findUnique({
        where: {
          notebook_id_request_id: { notebook_id: notebook.id, request_id: body.requestId },
        },
      });
      if (existing) return { page: pageSummary(existing), ...(await this.detail(tx, notebook.id)) };
      const source = body.duplicateOf ? await this.page(tx, notebook.id, body.duplicateOf) : null;
      const position = await this.slot(tx, notebook.id, body.afterPageId);
      const page = await tx.notebook_pages.create({
        data: {
          request_id: body.requestId,
          notebook_id: notebook.id,
          position,
          size: body.size ?? source?.size ?? notebook.default_size,
          paper: body.paper ?? source?.paper ?? notebook.default_paper,
          paper_color: body.paperColor ?? source?.paper_color ?? notebook.default_color,
          ...(source
            ? {
                content: source.content as Prisma.InputJsonValue,
                search_text: source.search_text,
              }
            : {}),
        },
      });
      await this.touch(tx, notebook.id);
      return { page: pageSummary(page), ...(await this.detail(tx, notebook.id)) };
    });
  }

  /**
   * Saves a page's content (autosave). `revision` is the one the editor loaded; a page changed
   * elsewhere since answers 409 with the current revision instead of being overwritten.
   */
  async savePage(actor: Profile, rawId: string, rawPageId: string, revision: number, raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException({
        code: 'NOTEBOOK_PAGE_INVALID',
        message: 'Dữ liệu trang không hợp lệ.',
      });
    }
    const clean = cleanPage(parsed);
    const userId = academicId(actor.id);
    return this.db.$transaction(async (tx) => {
      const notebook = await this.owned(tx, userId, rawId);
      const page = await this.page(tx, notebook.id, rawPageId);
      if (clean.assetIds.length) {
        const owned = await tx.notebook_assets.count({
          where: { id: { in: clean.assetIds.map((id) => BigInt(id)) }, user_id: userId },
        });
        if (owned !== clean.assetIds.length)
          throw new BadRequestException({
            code: 'NOTEBOOK_PAGE_INVALID',
            message: 'Trang dùng ảnh không có trong kho của bạn.',
          });
      }
      if (clean.annotationIds.length) {
        // Quotes must be the owner's own notes; one whose document is now unreadable stays
        // on the page (hidden when shown), so saving never depends on current access.
        const owned = await tx.annotations.count({
          where: { id: { in: clean.annotationIds.map((id) => BigInt(id)) }, user_id: userId },
        });
        if (owned !== clean.annotationIds.length)
          throw new BadRequestException({
            code: 'NOTEBOOK_PAGE_INVALID',
            message: 'Thẻ trích dẫn không thuộc ghi chú của bạn.',
          });
      }
      const { count } = await tx.notebook_pages.updateMany({
        where: { id: page.id, revision },
        data: {
          content: clean.content as unknown as Prisma.InputJsonValue,
          search_text: clean.searchText,
          revision: { increment: 1 },
          updated_at: new Date(),
        },
      });
      if (!count)
        throw new ConflictException({
          code: 'NOTEBOOK_PAGE_CONFLICT',
          message: 'Trang đã được sửa ở nơi khác.',
          revision: page.revision,
        });
      await this.touch(tx, notebook.id);
      const saved = await tx.notebook_pages.findUniqueOrThrow({ where: { id: page.id } });
      return { revision: saved.revision, updatedAt: saved.updated_at.toISOString() };
    });
  }

  async updatePage(actor: Profile, rawId: string, rawPageId: string, body: UpdatePageDto) {
    const userId = academicId(actor.id);
    return this.db.$transaction(async (tx) => {
      const notebook = await this.owned(tx, userId, rawId);
      const page = await this.page(tx, notebook.id, rawPageId);
      const { count } = await tx.notebook_pages.updateMany({
        where: { id: page.id, revision: body.revision },
        data: {
          size: body.size,
          paper: body.paper,
          paper_color: body.paperColor,
          revision: { increment: 1 },
          updated_at: new Date(),
        },
      });
      if (!count)
        throw new ConflictException({
          code: 'NOTEBOOK_PAGE_CONFLICT',
          message: 'Trang đã được sửa ở nơi khác.',
          revision: page.revision,
        });
      await this.touch(tx, notebook.id);
      return pageSummary(await tx.notebook_pages.findUniqueOrThrow({ where: { id: page.id } }));
    });
  }

  async deletePage(actor: Profile, rawId: string, rawPageId: string, body: NotebookRevisionDto) {
    const userId = academicId(actor.id);
    return this.db.$transaction(async (tx) => {
      const notebook = await this.owned(tx, userId, rawId);
      const page = await this.page(tx, notebook.id, rawPageId);
      if (page.revision !== body.revision)
        throw new ConflictException({
          code: 'NOTEBOOK_PAGE_CONFLICT',
          message: 'Trang đã được sửa ở nơi khác.',
          revision: page.revision,
        });
      if ((await tx.notebook_pages.count({ where: { notebook_id: notebook.id } })) <= 1)
        throw new ConflictException({
          code: 'NOTEBOOK_LAST_PAGE',
          message: 'Vở cần ít nhất một trang.',
        });
      await tx.notebook_pages.delete({ where: { id: page.id } });
      await tx.notebook_pages.updateMany({
        where: { notebook_id: notebook.id, position: { gt: page.position } },
        data: { position: { decrement: 1 } },
      });
      await this.touch(tx, notebook.id);
      return this.detail(tx, notebook.id);
    });
  }

  async reorder(actor: Profile, rawId: string, body: ReorderPagesDto) {
    const userId = academicId(actor.id);
    return this.db.$transaction(async (tx) => {
      const notebook = await this.owned(tx, userId, rawId);
      const pages = await tx.notebook_pages.findMany({
        where: { notebook_id: notebook.id },
        select: { id: true },
      });
      const current = new Set(pages.map((p) => String(p.id)));
      if (pages.length !== body.order.length || body.order.some((id) => !current.has(id)))
        throw new ConflictException({
          code: 'NOTEBOOK_CONFLICT',
          message: 'Danh sách trang đã thay đổi. Tải lại rồi sắp xếp lại.',
        });
      // Positions are unique but deferred, so the swap is checked at commit.
      for (const [position, id] of body.order.entries())
        await tx.notebook_pages.update({ where: { id: BigInt(id) }, data: { position } });
      await this.touch(tx, notebook.id);
      return this.detail(tx, notebook.id);
    });
  }

  /**
   * "Ghi vào vở" from the reader or the Sổ tay: the owner's readable notes become quote cards on
   * new pages at the end of the notebook, stacked top to bottom.
   */
  async addQuotes(actor: Profile, rawId: string, body: AddQuotesDto) {
    const userId = academicId(actor.id);
    return this.db.$transaction(async (tx) => {
      const notebook = await this.owned(tx, userId, rawId);
      const existing = await tx.notebook_pages.findUnique({
        where: {
          notebook_id_request_id: { notebook_id: notebook.id, request_id: body.requestId },
        },
      });
      if (existing) return { page: pageSummary(existing), ...(await this.detail(tx, notebook.id)) };
      const views = await this.quotes(tx, userId, body.annotationIds);
      if (body.annotationIds.some((id) => !views[id].available))
        throw new NotFoundException({
          code: 'NOTEBOOK_QUOTE_UNAVAILABLE',
          message: 'Có ghi chú không còn mở được. Tải lại rồi chọn lại.',
        });
      const size = notebook.default_size as PageSize;
      const box = PAGE_BOX[size];
      const margin = 56,
        gap = 20,
        w = box.w - margin * 2;
      const pages: PageItem[][] = [[]];
      let y = margin;
      for (const id of body.annotationIds) {
        const h = quoteHeight(views[id], w);
        if (y + h > box.h - margin && pages[pages.length - 1].length) {
          pages.push([]);
          y = margin;
        }
        pages[pages.length - 1].push({
          id: `q${randomUUID().replaceAll('-', '').slice(0, 20)}`,
          type: 'quote',
          annotationId: id,
          x: margin,
          y,
          w,
          h,
        });
        y += h + gap;
      }
      let first: notebook_pages | null = null;
      for (const [index, items] of pages.entries()) {
        const position = await this.slot(tx, notebook.id, undefined);
        const page = await tx.notebook_pages.create({
          data: {
            request_id: index === 0 ? body.requestId : randomUUID(),
            notebook_id: notebook.id,
            position,
            size,
            paper: notebook.default_paper,
            paper_color: notebook.default_color,
            content: { v: 1, items } as unknown as Prisma.InputJsonValue,
          },
        });
        first ??= page;
      }
      await this.touch(tx, notebook.id);
      return { page: pageSummary(first!), ...(await this.detail(tx, notebook.id)) };
    });
  }
}

/** A card tall enough for its text at 15 px / 22 px lines, header and padding included. */
export function quoteHeight(view: QuoteView, width: number) {
  if (!view.available) return 120;
  const perLine = Math.max(10, Math.floor((width - 40) / 7.6));
  const lines = (text: string) =>
    text
      ? text
          .split('\n')
          .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0)
      : 0;
  const body = lines(view.quote) + lines(view.note);
  return Math.min(640, Math.max(120, 76 + body * 22 + (view.quote && view.note ? 12 : 0)));
}
