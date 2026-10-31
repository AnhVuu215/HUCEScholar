import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { Profile } from '../auth/auth.types';
import { academicId } from '../academic/academic.service';
import { Prisma, type annotations } from '../generated/prisma/client';
import { DraftListDto } from './materials.dto';
import { available, LibraryService } from './library.service';
import { NotebookExportDto, NotebookSearchDto } from './annotation-search.dto';
import { ReviewLaterListDto } from './personal-library.dto';
import {
  colorNames,
  exportNotebook,
  MAX_EXPORT_ANNOTATIONS,
  type NotebookDocument,
} from './annotation-export';
import { annotationFilter, decodeCursor, encodeCursor } from './annotation-query';
import { noteItem } from './reading.service';
/** Short text for a "cần xem lại" row: the owner's note, else the highlighted quote. */
function excerpt(note: Pick<annotations, 'content' | 'anchor'>) {
  const anchor = note.anchor;
  const quote =
    anchor &&
    typeof anchor === 'object' &&
    !Array.isArray(anchor) &&
    typeof anchor.quote === 'string'
      ? anchor.quote
      : '';
  const text = (note.content.trim() || quote).replace(/\s+/g, ' ').trim();
  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
}
@Injectable()
export class PersonalLibraryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly library: LibraryService,
  ) {}
  private run<T>(
    actor: Profile,
    writing: boolean,
    action: (tx: Prisma.TransactionClient, owner: bigint) => Promise<T>,
  ) {
    const owner = academicId(actor.id);
    return this.db.$transaction(
      async (tx) => {
        if (writing)
          await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`hucescholar:saved:${owner}`}, 0))`;
        await tx.$queryRaw`SELECT id FROM hucescholar.users WHERE id=${owner} FOR SHARE`;
        const user = await tx.users.findUnique({
          where: { id: owner },
          select: { status: true, verified_at: true },
        });
        if (!user || user.status !== 'ACTIVE' || !user.verified_at)
          throw new ForbiddenException('Tài khoản không còn quyền truy cập.');
        return action(tx, owner);
      },
      { isolationLevel: writing ? 'ReadCommitted' : 'RepeatableRead' },
    );
  }
  status(actor: Profile, rawId: string) {
    const document_id = academicId(rawId);
    return this.run(actor, false, async (tx, user_id) => ({
      saved: !!(await tx.saved_documents.findUnique({
        where: { user_id_document_id: { user_id, document_id } },
      })),
    }));
  }
  change(actor: Profile, rawId: string, saved: boolean) {
    const document_id = academicId(rawId);
    return this.run(actor, true, async (tx, user_id) => {
      if (saved) {
        await tx.$queryRaw`SELECT id FROM hucescholar.documents WHERE id=${document_id} FOR SHARE`;
        const document = await tx.documents.findUnique({
          where: { id: document_id },
          select: { current_version_id: true },
        });
        if (!document?.current_version_id)
          throw new NotFoundException('Tài liệu chưa có bản công bố khả dụng.');
        await this.library.access(tx, actor, document.current_version_id);
        await tx.saved_documents.upsert({
          where: { user_id_document_id: { user_id, document_id } },
          create: { user_id, document_id },
          update: {},
        });
      } else await tx.saved_documents.deleteMany({ where: { user_id, document_id } });
      return { saved };
    });
  }
  saved(actor: Profile, query: DraftListDto) {
    return this.run(actor, false, async (tx, user_id) => {
      const rows = await tx.saved_documents.findMany({
        where: { user_id },
        orderBy: [{ created_at: 'desc' }, { document_id: 'desc' }],
        take: query.limit,
        skip: (query.page - 1) * query.limit,
        select: {
          document_id: true,
          created_at: true,
          documents: { select: { current_version_id: true } },
        },
      });
      const items = await this.library.readableItems(
        tx,
        rows.flatMap((r) =>
          r.documents.current_version_id ? [r.documents.current_version_id] : [],
        ),
      );
      return {
        items: rows.map((r) => ({
          documentId: String(r.document_id),
          savedAt: r.created_at.toISOString(),
          material: items.get(String(r.documents.current_version_id)) ?? null,
        })),
        total: await tx.saved_documents.count({ where: { user_id } }),
        page: query.page,
        limit: query.limit,
      };
    });
  }
  recent(actor: Profile, query: DraftListDto) {
    return this.run(actor, false, async (tx, user_id) => {
      const rows = await tx.reading_progress.findMany({
        where: { user_id },
        orderBy: [{ updated_at: 'desc' }, { version_id: 'desc' }],
        take: query.limit,
        skip: (query.page - 1) * query.limit,
        select: {
          version_id: true,
          page_number: true,
          updated_at: true,
          document_versions: { select: { document_id: true } },
        },
      });
      const items = await this.library.readableItems(
        tx,
        rows.map((r) => r.version_id),
      );
      return {
        items: rows.map((r) => ({
          documentId: String(r.document_versions.document_id),
          versionId: String(r.version_id),
          pageNumber: r.page_number,
          readAt: r.updated_at.toISOString(),
          material: items.get(String(r.version_id)) ?? null,
        })),
        total: await tx.reading_progress.count({ where: { user_id } }),
        page: query.page,
        limit: query.limit,
      };
    });
  }
  /**
   * CAL-04: the owner's "cần xem lại" marks across documents, newest version first, then by page.
   * Marks on versions that are no longer readable stay stored (LEARN-02) but are not listed.
   */
  reviewLater(actor: Profile, query: ReviewLaterListDto) {
    return this.run(actor, false, async (tx, user_id) => {
      const where: Prisma.annotationsWhereInput = {
        user_id,
        review_later: true,
        ...(query.versionId ? { version_id: academicId(query.versionId) } : {}),
        document_versions: {
          AND: [
            available(),
            ...(query.courseId
              ? [{ version_courses: { some: { course_id: academicId(query.courseId) } } }]
              : []),
          ],
        },
      };
      const rows = await tx.annotations.findMany({
        where,
        orderBy: [{ version_id: 'desc' }, { page_number: 'asc' }, { id: 'asc' }],
        take: query.limit,
        skip: (query.page - 1) * query.limit,
        select: {
          id: true,
          version_id: true,
          page_number: true,
          kind: true,
          content: true,
          anchor: true,
          color: true,
        },
      });
      const items = await this.library.readableItems(tx, [
        ...new Set(rows.map((r) => r.version_id)),
      ]);
      return {
        items: rows.map((r) => ({
          id: String(r.id),
          versionId: String(r.version_id),
          pageNumber: r.page_number,
          kind: r.kind,
          excerpt: excerpt(r),
          ...(r.kind === 'TEXT_HIGHLIGHT' ? { color: r.color } : {}),
          material: items.get(String(r.version_id)) ?? null,
        })),
        total: await tx.annotations.count({ where }),
        page: query.page,
        limit: query.limit,
      };
    });
  }
  /** CAL-04: documents and courses that have readable "cần xem lại" marks, for the filters. */
  reviewLaterFilters(actor: Profile) {
    return this.run(actor, false, async (tx, user_id) => {
      const counts = await tx.annotations.groupBy({
        by: ['version_id'],
        where: { user_id, review_later: true, document_versions: available() },
        _count: { _all: true },
      });
      const ids = counts.map((c) => c.version_id);
      const versions = await tx.document_versions.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true },
      });
      const courses = await tx.courses.findMany({
        where: { version_courses: { some: { version_id: { in: ids } } } },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: { id: true, code: true, name: true },
      });
      const count = new Map(counts.map((c) => [c.version_id, c._count._all]));
      return {
        documents: versions
          .map((v) => ({ versionId: String(v.id), title: v.title, marks: count.get(v.id)! }))
          .sort(
            (a, b) =>
              a.title.localeCompare(b.title, 'vi') ||
              Number(BigInt(a.versionId) - BigInt(b.versionId)),
          ),
        courses: courses.map((c) => ({ id: String(c.id), code: c.code, name: c.name })),
      };
    });
  }
  /** Readable versions the owner has annotated, optionally only those taught in one course. */
  private async annotatedVersions(
    tx: Prisma.TransactionClient,
    user_id: bigint,
    course?: bigint,
    version?: bigint,
  ) {
    const rows = await tx.document_versions.findMany({
      where: {
        AND: [
          available(),
          { annotations: { some: { user_id } } },
          ...(course ? [{ version_courses: { some: { course_id: course } } }] : []),
          ...(version ? [{ id: version }] : []),
        ],
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
  /** LEARN-03: courses of the readable documents the owner has notes on, for the filter. */
  notebookCourses(actor: Profile) {
    return this.run(actor, false, async (tx, user_id) => {
      const versions = await this.annotatedVersions(tx, user_id);
      const courses = await tx.courses.findMany({
        where: { version_courses: { some: { version_id: { in: versions } } } },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: { id: true, code: true, name: true },
      });
      return { items: courses.map((c) => ({ id: String(c.id), code: c.code, name: c.name })) };
    });
  }
  /**
   * LEARN-03: the owner's notes and highlights on every readable version, newest version first,
   * then by page, with the per-version notebook's filters plus a course. Notes on versions that
   * are no longer readable stay stored but are not listed, and their titles are not revealed.
   */
  notebook(actor: Profile, query: NotebookSearchDto) {
    return this.run(actor, false, async (tx, owner) => {
      const filter = annotationFilter(query, [query.courseId ?? null, query.versionId ?? null]);
      const head = [2, String(owner)];
      const after = query.cursor
        ? decodeCursor(query.cursor, head, 3, filter.fingerprint, ([version, page, id]) =>
            typeof version === 'string' &&
            Number.isInteger(page) &&
            (page as number) >= 1 &&
            typeof id === 'string'
              ? { version: academicId(version), page: page as number, id: academicId(id) }
              : null,
          )
        : undefined;
      const limit = query.limit ?? 20;
      const course = query.courseId ? academicId(query.courseId) : undefined;
      const version = query.versionId ? academicId(query.versionId) : undefined;
      const versions = await this.annotatedVersions(tx, owner, course, version);
      if (!versions.length) return { items: [], nextCursor: null };
      const rows = await tx.$queryRaw<annotations[]>(Prisma.sql`
        SELECT * FROM hucescholar.annotations
        WHERE user_id = ${owner} AND version_id = ANY(${versions}) ${filter.sql}
          ${after ? Prisma.sql`AND (version_id < ${after.version} OR (version_id = ${after.version} AND (page_number, id) > (${after.page}, ${after.id})))` : Prisma.empty}
        ORDER BY version_id DESC, page_number ASC, id ASC LIMIT ${limit + 1}
      `);
      const page = rows.slice(0, limit),
        last = page.at(-1);
      const materials = await this.library.readableItems(tx, [
        ...new Set(page.map((r) => r.version_id)),
      ]);
      return {
        items: page.map((r) => ({
          ...noteItem(r),
          material: materials.get(String(r.version_id)) ?? null,
        })),
        nextCursor:
          rows.length > limit && last
            ? encodeCursor(
                head,
                [String(last.version_id), last.page_number, String(last.id)],
                filter.fingerprint,
              )
            : null,
      };
    });
  }
  /**
   * EXPORT-02: every note the notebook search would list under the same filters, as one file,
   * newest version first like the notebook. Unreadable versions are left out, as in the search.
   */
  notebookExport(actor: Profile, query: NotebookExportDto) {
    return this.run(actor, false, async (tx, owner) => {
      const filter = annotationFilter(query);
      const course = query.courseId ? academicId(query.courseId) : undefined;
      const version = query.versionId ? academicId(query.versionId) : undefined;
      const versions = await this.annotatedVersions(tx, owner, course, version);
      const rows = versions.length
        ? await tx.$queryRaw<annotations[]>(Prisma.sql`
            SELECT * FROM hucescholar.annotations
            WHERE user_id = ${owner} AND version_id = ANY(${versions}) ${filter.sql}
            ORDER BY version_id DESC, page_number ASC, id ASC LIMIT ${MAX_EXPORT_ANNOTATIONS + 1}
          `)
        : [];
      if (rows.length > MAX_EXPORT_ANNOTATIONS)
        throw new BadRequestException({
          code: 'EXPORT_TOO_LARGE',
          message: `Sổ tay có hơn ${MAX_EXPORT_ANNOTATIONS} mục; thu hẹp bộ lọc rồi xuất lại.`,
        });
      const sources = new Map(
        (
          await tx.document_versions.findMany({
            where: { id: { in: [...new Set(rows.map((r) => r.version_id))] } },
            select: { id: true, title: true, authors: true, version_no: true },
          })
        ).map((v) => [v.id, v]),
      );
      // Rows arrive sorted by version, so consecutive rows share one document.
      const documents: (NotebookDocument & { versionId: bigint })[] = [];
      for (const row of rows) {
        const last = documents.at(-1);
        if (last?.versionId === row.version_id) last.rows.push(row);
        else {
          const v = sources.get(row.version_id)!;
          documents.push({
            versionId: row.version_id,
            title: v.title,
            authors: v.authors,
            versionNo: v.version_no,
            rows: [row],
          });
        }
      }
      const courseRow = course
        ? await tx.courses.findUnique({ where: { id: course }, select: { code: true, name: true } })
        : null;
      const kind = query.color ? 'TEXT_HIGHLIGHT' : query.kind;
      const filters = [
        course ? `môn ${courseRow ? `${courseRow.code} · ${courseRow.name}` : 'không còn'}` : '',
        kind === 'PAGE_NOTE' ? 'chỉ ghi chú trang' : kind === 'TEXT_HIGHLIGHT' ? 'chỉ đoạn tô' : '',
        query.color ? `màu ${colorNames[query.color] ?? query.color}` : '',
        version ? 'một tài liệu' : '',
        query.reviewLater ? 'cần xem lại' : '',
        query.query ? `có chữ “${query.query}”` : '',
      ].filter(Boolean);
      return exportNotebook(
        documents,
        { filters: filters.length ? filters.join(' · ') : 'không lọc', exportedAt: new Date() },
        query.format,
      );
    });
  }
}
