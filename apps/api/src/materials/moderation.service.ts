import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  StreamableFile,
} from '@nestjs/common';
import { once } from 'node:events';
import { DatabaseService } from '../database/database.module';
import { Profile } from '../auth/auth.types';
import { Prisma } from '../generated/prisma/client';
import { PrivateStore, MissingObjectError, fileMissing } from '../files/private-store';
import { MaterialsService } from './materials.service';
import { notify, type NotificationKind } from '../notifications/notify';
import { ModerationDecisionDto, ModerationListDto } from './moderation.dto';
import { parseId } from '../common/ids';
import { lockCatalog } from '../common/locks';
import { conflict } from '../common/errors';
import { requireActiveUser } from '../common/active-user';

const selection = {
  id: true,
  revision: true,
  status: true,
  submitted_revision: true,
  submitted_at: true,
  resolved_at: true,
  reason: true,
  users_publication_requests_submitted_byTousers: { select: { id: true, display_name: true } },
  users_publication_requests_resolved_byTousers: { select: { display_name: true } },
  document_versions: {
    select: {
      id: true,
      document_id: true,
      version_no: true,
      revision: true,
      title: true,
      authors: true,
      description: true,
      material_type: true,
      source_reference: true,
      rights_basis: true,
      rights_valid_until: true,
      download_allowed: true,
      review_status: true,
      files: {
        select: {
          id: true,
          original_name: true,
          byte_size: true,
          page_count: true,
          scan_status: true,
          check_error: true,
        },
      },
      version_courses: {
        select: {
          courses: {
            select: {
              id: true,
              code: true,
              name: true,
              is_active: true,
              faculties: { select: { is_active: true } },
            },
          },
        },
      },
      documents_document_versions_document_idTodocuments: {
        select: { visibility: true, current_version_id: true, manager_id: true },
      },
    },
  },
} satisfies Prisma.publication_requestsSelect;
type ReviewRow = Prisma.publication_requestsGetPayload<{ select: typeof selection }>;

@Injectable()
export class ModerationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly materials: MaterialsService,
    private readonly store: PrivateStore,
  ) {}
  private matches(row: ReviewRow) {
    const v = row.document_versions;
    return (
      (row.status === 'PENDING' &&
        v.review_status === 'SUBMITTED' &&
        v.revision === row.submitted_revision) ||
      (['APPROVED', 'CHANGES_REQUIRED', 'REJECTED'].includes(row.status) &&
        v.review_status === row.status &&
        v.revision === row.submitted_revision + 1)
    );
  }
  private serialize(row: ReviewRow) {
    const v = row.document_versions,
      doc = v.documents_document_versions_document_idTodocuments;
    return {
      id: String(row.id),
      revision: row.revision,
      status: row.status,
      submittedRevision: row.submitted_revision,
      submittedAt: row.submitted_at.toISOString(),
      resolvedAt: row.resolved_at?.toISOString() ?? null,
      reason: row.reason,
      submitter: {
        id: String(row.users_publication_requests_submitted_byTousers.id),
        name: row.users_publication_requests_submitted_byTousers.display_name,
      },
      resolvedBy: row.users_publication_requests_resolved_byTousers?.display_name ?? null,
      documentId: String(v.document_id),
      versionId: String(v.id),
      versionNo: v.version_no,
      versionRevision: v.revision,
      reviewStatus: v.review_status,
      visibility: doc.visibility,
      currentVersionId: doc.current_version_id ? String(doc.current_version_id) : null,
      title: v.title,
      authors: v.authors,
      description: v.description,
      materialType: v.material_type,
      sourceReference: v.source_reference,
      rightsBasis: v.rights_basis,
      rightsValidUntil: v.rights_valid_until?.toISOString() ?? null,
      downloadAllowed: v.download_allowed,
      fileState: v.files?.scan_status ?? 'MISSING',
      fileError: v.files?.check_error ?? null,
      pdf: v.files
        ? {
            name: v.files.original_name,
            byteSize: Number(v.files.byte_size),
            pageCount: v.files.page_count,
          }
        : null,
      courses: v.version_courses.map(({ courses: c }) => ({
        id: String(c.id),
        code: c.code,
        name: c.name,
        active: c.is_active && c.faculties.is_active,
      })),
      snapshotMatches: this.matches(row),
    };
  }
  private async read(tx: Prisma.TransactionClient, id: bigint) {
    const row = await tx.publication_requests.findUnique({ where: { id }, select: selection });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu duyệt.');
    return row;
  }
  async list(query: ModerationListDto) {
    const where: Prisma.publication_requestsWhereInput = {
      status: query.status ?? 'PENDING',
      document_versions: {
        ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
      },
    };
    return this.db.$transaction(
      async (tx) => ({
        items: (
          await tx.publication_requests.findMany({
            where,
            select: selection,
            orderBy: [{ submitted_at: 'asc' }, { id: 'asc' }],
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          })
        ).map((r) => this.serialize(r)),
        total: await tx.publication_requests.count({ where }),
        page: query.page,
        limit: query.limit,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async get(rawId: string) {
    return this.db.$transaction(
      async (tx) => ({ item: this.serialize(await this.read(tx, parseId(rawId))) }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async decide(actor: Profile, rawId: string, body: ModerationDecisionDto) {
    if (body.outcome !== 'APPROVED' && !body.reason.trim())
      throw conflict('REASON_REQUIRED', 'Nhập lý do yêu cầu sửa hoặc từ chối.');
    if (body.outcome === 'APPROVED' && body.rightsConfirmed !== true)
      throw conflict(
        'RIGHTS_CONFIRMATION_REQUIRED',
        'Xác nhận đã kiểm tra nội dung và căn cứ quyền trước khi duyệt.',
      );
    const id = parseId(rawId),
      actorId = parseId(actor.id);
    return this.db.$transaction(async (tx) => {
      await requireActiveUser(tx, actorId, 'Không còn quyền kiểm duyệt.', 'ADMIN');
      await lockCatalog(tx);
      const target = await this.read(tx, id);
      const documentId = target.document_versions.document_id,
        versionId = target.document_versions.id;
      await tx.$queryRaw`SELECT id FROM hucescholar.documents WHERE id=${documentId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM hucescholar.document_versions WHERE id=${versionId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM hucescholar.publication_requests WHERE id=${id} FOR UPDATE`;
      const row = await this.read(tx, id),
        v = row.document_versions;
      if (
        row.revision !== body.revision ||
        row.submitted_revision !== body.submittedRevision ||
        row.status !== 'PENDING' ||
        !this.matches(row)
      )
        throw conflict(
          'REQUEST_CHANGED',
          'Yêu cầu đã thay đổi. Tải trạng thái mới trước khi quyết định.',
        );
      if (body.outcome === 'APPROVED') {
        const doc = v.documents_document_versions_document_idTodocuments;
        await tx.$queryRaw`SELECT id FROM hucescholar.users WHERE id=${doc.manager_id} FOR SHARE`;
        const manager = await tx.users.findUnique({ where: { id: doc.manager_id } });
        if (
          !manager ||
          manager.role !== 'STUDENT' ||
          manager.status !== 'ACTIVE' ||
          !manager.verified_at
        )
          throw conflict('MANAGER_UNAVAILABLE', 'Chủ tài liệu không còn đủ điều kiện công bố.');
        if (
          !v.title.trim() ||
          !v.source_reference.trim() ||
          !v.rights_basis.trim() ||
          !v.version_courses.length
        )
          throw conflict('METADATA_REQUIRED', 'Thiếu thông tin, nguồn, căn cứ quyền hoặc môn.');
        if (v.rights_valid_until && v.rights_valid_until <= new Date())
          throw conflict('RIGHTS_EXPIRED', 'Căn cứ quyền đã hết hạn.');
        await this.materials.checkCourses(
          tx,
          v.version_courses.map((c) => c.courses.id),
        );
        if (v.files)
          await tx.$queryRaw`SELECT id FROM hucescholar.files WHERE id=${v.files.id} FOR SHARE`;
        const file = v.files ? await tx.files.findUnique({ where: { id: v.files.id } }) : null;
        if (!file || file.scan_status !== 'SAFE')
          throw conflict('FILE_NOT_SAFE', 'PDF không còn an toàn để duyệt.');
      }
      const now = new Date();
      await tx.publication_requests.update({
        where: { id },
        data: {
          status: body.outcome,
          resolved_by: actorId,
          resolved_at: now,
          reason: body.reason || null,
          revision: { increment: 1 },
        },
      });
      await tx.document_versions.update({
        where: { id: versionId },
        data: { review_status: body.outcome, revision: { increment: 1 }, updated_at: now },
      });
      await tx.documents.update({
        where: { id: documentId },
        data: {
          ...(body.outcome === 'APPROVED' ? { current_version_id: versionId } : {}),
          revision: { increment: 1 },
          updated_at: now,
        },
      });
      await this.materials.audit(tx, actorId, documentId, `MATERIAL_${body.outcome}`);
      // The submitter reads the admin's reason on the draft itself; the notice only links there.
      await notify(tx, {
        userId: row.users_publication_requests_submitted_byTousers.id,
        kind: `REVIEW_${body.outcome}` as NotificationKind,
        eventKey: `request:${id}`,
        versionId,
      });
      return { item: this.serialize(await this.read(tx, id)) };
    });
  }
  async preview(rawId: string) {
    const file = await this.db.$transaction(async (tx) => {
      const row = await this.read(tx, parseId(rawId));
      if (!this.matches(row))
        throw conflict(
          'REQUEST_CHANGED',
          'Snapshot đã thay đổi; không xem file hiện tại như bản đã gửi.',
        );
      if (!row.document_versions.files) throw conflict('FILE_NOT_SAFE', 'Không có PDF an toàn.');
      const id = row.document_versions.files.id;
      await tx.$queryRaw`SELECT id FROM hucescholar.files WHERE id=${id} FOR SHARE`;
      const current = await tx.files.findUnique({ where: { id } });
      if (!current || current.scan_status !== 'SAFE')
        throw conflict('FILE_NOT_SAFE', 'Không có PDF an toàn.');
      return current;
    });
    try {
      const stream = await this.store.read(file.object_key);
      // Local streams open lazily; report storage failures before sending PDF headers.
      if ('pending' in stream && stream.pending) await once(stream, 'open');
      return new StreamableFile(stream, {
        type: 'application/pdf',
        disposition: 'inline; filename="review.pdf"',
        length: Number(file.byte_size),
      });
    } catch (error) {
      if (error instanceof MissingObjectError) throw fileMissing(file.id);
      throw new ServiceUnavailableException('Chưa mở được PDF. Thử lại sau.');
    }
  }
}
