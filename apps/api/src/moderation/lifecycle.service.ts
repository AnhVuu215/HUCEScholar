import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { Profile } from '../auth/auth.types';
import { Prisma } from '../generated/prisma/client';
import { MaterialsService } from '../drafts/materials.service';
import { DraftListDto } from '../drafts/materials.dto';
import { LifecycleListDto, MaterialVisibilityDto } from './lifecycle.dto';
import { parseId } from '../common/ids';
import { lockCatalog } from '../common/locks';
import { conflict } from '../common/errors';
import { requireActiveUser } from '../common/active-user';
import { TEXT_INDEX_MAX_ATTEMPTS, textIndexState } from '../files/text-index-state';
const docSelect = {
  id: true,
  visibility: true,
  revision: true,
  manager_id: true,
  current_version_id: true,
  users_documents_manager_idTousers: { select: { id: true, display_name: true } },
} satisfies Prisma.documentsSelect;
const versionSelect = {
  id: true,
  version_no: true,
  document_id: true,
  title: true,
  review_status: true,
  publication_method: true,
  source_reference: true,
  rights_basis: true,
  rights_valid_until: true,
  file_id: true,
  files: {
    select: {
      scan_status: true,
      check_error: true,
      has_text_layer: true,
      copy_restricted: true,
      file_text: { select: { pages: true, truncated: true, attempts: true, indexed_at: true } },
    },
  },
} satisfies Prisma.document_versionsSelect;
type Doc = Prisma.documentsGetPayload<{ select: typeof docSelect }>;
type Version = Prisma.document_versionsGetPayload<{ select: typeof versionSelect }>;
const versionItem = (v: Version | null) =>
  v
    ? {
        id: String(v.id),
        versionNo: v.version_no,
        title: v.title,
        reviewStatus: v.review_status,
        publicationMethod: v.publication_method,
        fileState: v.files?.scan_status ?? 'MISSING',
        fileError: v.files?.check_error ?? null,
      }
    : null;
/** SEARCH-04: content search only reads the current version, so that is the file reported. */
const overview = (d: Doc, v: Version, current: Version | null) => ({
  id: String(d.id),
  visibility: d.visibility,
  revision: d.revision,
  manager: { id: String(d.manager_id), name: d.users_documents_manager_idTousers.display_name },
  latest: versionItem(v)!,
  currentVersionId: d.current_version_id ? String(d.current_version_id) : null,
  textIndex: current ? textIndexState(current.files) : null,
});
/** Current version whose PDF text extraction gave up; the worker no longer retries it. */
const textIndexFailed = Prisma.sql`EXISTS (
  SELECT 1 FROM hucescholar.document_versions cv
  JOIN hucescholar.files f ON f.id=cv.file_id
  JOIN hucescholar.file_text t ON t.file_id=f.id
  WHERE cv.id=d.current_version_id AND f.scan_status='SAFE' AND f.has_text_layer
    AND NOT f.copy_restricted AND t.indexed_at IS NULL AND t.attempts>=${TEXT_INDEX_MAX_ATTEMPTS}
)`;
@Injectable()
export class LifecycleService {
  constructor(
    private readonly db: DatabaseService,
    private readonly materials: MaterialsService,
  ) {}
  private async read(tx: Prisma.TransactionClient, id: bigint) {
    const doc = await tx.documents.findUnique({ where: { id }, select: docSelect });
    if (!doc) throw new NotFoundException('Không tìm thấy tài liệu.');
    return doc;
  }
  private async courseIds(tx: Prisma.TransactionClient, id: bigint) {
    const rows = await tx.version_courses.findMany({
      where: { document_versions: { document_id: id } },
      select: { course_id: true },
      distinct: ['course_id'],
    });
    return rows.map((r) => r.course_id);
  }
  private async detail(tx: Prisma.TransactionClient, id: bigint, query = new DraftListDto()) {
    const doc = await this.read(tx, id);
    const latest = await tx.document_versions.findFirst({
      where: { document_id: id },
      orderBy: { version_no: 'desc' },
      select: versionSelect,
    });
    if (!latest) throw new NotFoundException('Tài liệu chưa có phiên bản.');
    const current = doc.current_version_id
      ? await tx.document_versions.findUnique({
          where: { id: doc.current_version_id },
          select: versionSelect,
        })
      : null;
    const courseIds = await this.courseIds(tx, id);
    const courses = await tx.courses.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
    const historyQuery = {
      where: { document_id: id },
      orderBy: [{ created_at: 'desc' as const }, { id: 'desc' as const }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    };
    const transfers = await tx.ownership_transfers.findMany({
      ...historyQuery,
      include: {
        users_ownership_transfers_from_user_idTousers: { select: { display_name: true } },
        users_ownership_transfers_to_user_idTousers: { select: { display_name: true } },
      },
    });
    const visibility = await tx.visibility_events.findMany(historyQuery);
    return {
      ...overview(doc, latest, current),
      current: versionItem(current),
      courses: courses.map((c) => ({ ...c, id: String(c.id) })),
      history: {
        transfers: transfers.map((t) => ({
          id: String(t.id),
          fromUserId: String(t.from_user_id),
          toUserId: String(t.to_user_id),
          fromName: t.users_ownership_transfers_from_user_idTousers.display_name,
          toName: t.users_ownership_transfers_to_user_idTousers.display_name,
          performedBy: String(t.performed_by),
          reason: t.reason,
          createdAt: t.created_at.toISOString(),
        })),
        visibility: visibility.map((t) => ({
          id: String(t.id),
          fromVisibility: t.from_visibility,
          toVisibility: t.to_visibility,
          performedBy: String(t.performed_by),
          reason: t.reason,
          createdAt: t.created_at.toISOString(),
        })),
        totalTransfers: await tx.ownership_transfers.count({ where: { document_id: id } }),
        totalVisibility: await tx.visibility_events.count({ where: { document_id: id } }),
        page: query.page,
        limit: query.limit,
      },
    };
  }
  get(rawId: string, query: DraftListDto) {
    return this.db.$transaction(
      async (tx) => ({ item: await this.detail(tx, parseId(rawId), query) }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  list(query: LifecycleListDto) {
    const from = Prisma.sql`FROM hucescholar.documents d JOIN LATERAL (
      SELECT v.id,v.title FROM hucescholar.document_versions v WHERE v.document_id=d.id ORDER BY v.version_no DESC LIMIT 1
    ) latest ON TRUE WHERE TRUE
    ${query.search ? Prisma.sql`AND latest.title ILIKE ${`%${query.search}%`}` : Prisma.empty}
    ${query.visibility ? Prisma.sql`AND d.visibility=${query.visibility}` : Prisma.empty}
    ${query.textIndex === 'FAILED' ? Prisma.sql`AND ${textIndexFailed}` : Prisma.empty}`;
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ id: bigint; version_id: bigint }[]>(
          Prisma.sql`SELECT d.id,latest.id AS version_id ${from} ORDER BY d.updated_at DESC,d.id DESC LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
        );
        const docs = await tx.documents.findMany({
          where: { id: { in: rows.map((r) => r.id) } },
          select: docSelect,
        });
        const versions = await tx.document_versions.findMany({
          where: {
            id: {
              in: [
                ...rows.map((r) => r.version_id),
                ...docs.flatMap((d) => (d.current_version_id ? [d.current_version_id] : [])),
              ],
            },
          },
          select: versionSelect,
        });
        const docMap = new Map(docs.map((d) => [String(d.id), d])),
          versionMap = new Map(versions.map((v) => [String(v.id), v]));
        const count = await tx.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT count(*) AS total ${from}`,
        );
        return {
          items: rows.map((r) => {
            const doc = docMap.get(String(r.id))!;
            return overview(
              doc,
              versionMap.get(String(r.version_id))!,
              doc.current_version_id
                ? (versionMap.get(String(doc.current_version_id)) ?? null)
                : null,
            );
          }),
          total: Number(count[0].total),
          page: query.page,
          limit: query.limit,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  private async lock(
    tx: Prisma.TransactionClient,
    actor: Profile,
    rawId: string,
    revision: number,
  ) {
    const actorId = parseId(actor.id),
      id = parseId(rawId);
    await requireActiveUser(tx, actorId, 'Không còn quyền quản lý học liệu.', 'ADMIN');
    await lockCatalog(tx);
    await tx.$queryRaw`SELECT id FROM hucescholar.documents WHERE id=${id} FOR UPDATE`;
    const doc = await this.read(tx, id);
    if (doc.revision !== revision)
      throw conflict('STALE_REVISION', 'Tài liệu đã thay đổi. Tải trạng thái trước khi tiếp tục.');
    return { doc, id, actorId };
  }
  visibility(actor: Profile, rawId: string, body: MaterialVisibilityDto) {
    return this.db.$transaction(async (tx) => {
      const { doc, id, actorId } = await this.lock(tx, actor, rawId, body.revision);
      if (doc.visibility === body.visibility)
        throw conflict(
          'VISIBILITY_UNCHANGED',
          'Tài liệu đã ở trạng thái này. Tải lại để đối chiếu.',
        );
      if (body.visibility === 'VISIBLE') {
        if (!body.resolved)
          throw conflict(
            'RESOLUTION_REQUIRED',
            'Xác nhận đã giải quyết lý do ẩn trước khi khôi phục.',
          );
        if (!doc.current_version_id)
          throw conflict('MATERIAL_UNAVAILABLE', 'Chưa có bản hiện hành đủ điều kiện khôi phục.');
        await tx.$queryRaw`SELECT id FROM hucescholar.document_versions WHERE id=${doc.current_version_id} FOR SHARE`;
        const v = await tx.document_versions.findUnique({
          where: { id: doc.current_version_id },
          select: versionSelect,
        });
        if (v?.file_id)
          await tx.$queryRaw`SELECT id FROM hucescholar.files WHERE id=${v.file_id} FOR SHARE`;
        const file = v?.file_id
          ? await tx.files.findUnique({ where: { id: v.file_id }, select: { scan_status: true } })
          : null;
        if (
          !v ||
          v.review_status !== 'APPROVED' ||
          file?.scan_status !== 'SAFE' ||
          // Versions a lecturer self-published before ROLE-01 had no required source fields.
          (v.publication_method !== 'LECTURER_SELF' &&
            (!v.source_reference.trim() || !v.rights_basis.trim())) ||
          (v.rights_valid_until && v.rights_valid_until <= new Date())
        )
          throw conflict(
            'MATERIAL_UNAVAILABLE',
            'Bản hiện hành phải đã duyệt, PDF an toàn và còn quyền sử dụng.',
          );
      }
      await this.applyVisibility(tx, actorId, id, doc.visibility, body.visibility, body.reason);
      return { item: await this.detail(tx, id) };
    });
  }
  /**
   * SEARCH-04: gives a current-version PDF whose text extraction failed three more tries. The
   * worker sweep picks it up within a minute; the file and its review state are not touched.
   */
  retryTextIndex(actor: Profile, rawId: string) {
    return this.db.$transaction(async (tx) => {
      const actorId = parseId(actor.id),
        id = parseId(rawId);
      await requireActiveUser(tx, actorId, 'Không còn quyền quản lý học liệu.', 'ADMIN');
      const doc = await this.read(tx, id);
      const fileId = doc.current_version_id
        ? (
            await tx.document_versions.findUnique({
              where: { id: doc.current_version_id },
              select: { file_id: true },
            })
          )?.file_id
        : null;
      if (fileId)
        await tx.$queryRaw`SELECT file_id FROM hucescholar.file_text WHERE file_id=${fileId} FOR UPDATE`;
      const file = fileId
        ? await tx.files.findUnique({ where: { id: fileId }, select: versionSelect.files.select })
        : null;
      if (!fileId || textIndexState(file).state !== 'FAILED')
        throw conflict(
          'TEXT_INDEX_NOT_FAILED',
          'Bản hiện hành không ở trạng thái lỗi lập chỉ mục. Tải lại để đối chiếu.',
        );
      await tx.file_text.update({ where: { file_id: fileId }, data: { attempts: 0 } });
      await this.materials.audit(tx, actorId, id, 'TEXT_INDEX_RETRIED');
      return { item: await this.detail(tx, id) };
    });
  }
  /**
   * Hides a document inside a caller's transaction (report resolution). The caller has already
   * verified an active admin; this takes the same locks and revision check as `visibility`.
   */
  async hideWithin(
    tx: Prisma.TransactionClient,
    actorId: bigint,
    id: bigint,
    revision: number,
    reason: string,
  ) {
    await lockCatalog(tx);
    await tx.$queryRaw`SELECT id FROM hucescholar.documents WHERE id=${id} FOR UPDATE`;
    const doc = await this.read(tx, id);
    if (doc.revision !== revision)
      throw conflict('STALE_REVISION', 'Tài liệu đã thay đổi. Tải trạng thái trước khi tiếp tục.');
    if (doc.visibility === 'HIDDEN')
      throw conflict('VISIBILITY_UNCHANGED', 'Tài liệu đã bị ẩn. Tải lại để đối chiếu.');
    return this.applyVisibility(tx, actorId, id, doc.visibility, 'HIDDEN', reason);
  }
  private async applyVisibility(
    tx: Prisma.TransactionClient,
    actorId: bigint,
    id: bigint,
    from: string,
    to: string,
    reason: string,
  ) {
    await tx.documents.update({
      where: { id },
      data: { visibility: to, revision: { increment: 1 }, updated_at: new Date() },
    });
    const event = await tx.visibility_events.create({
      data: {
        document_id: id,
        performed_by: actorId,
        from_visibility: from,
        to_visibility: to,
        reason,
      },
    });
    await this.materials.audit(
      tx,
      actorId,
      id,
      to === 'HIDDEN' ? 'MATERIAL_HIDDEN' : 'MATERIAL_RESTORED',
    );
    return event.id;
  }
}
