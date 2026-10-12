import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { Profile } from '../auth/auth.types';
import { academicId } from '../academic/academic.service';
import { Prisma } from '../generated/prisma/client';
import {
  DraftFieldsDto,
  DraftListDto,
  MaterialListDto,
  MaterialHistoryDto,
  SubmitMaterialDto,
  WithdrawMaterialDto,
  UpdateDraftDto,
} from './materials.dto';

const selection = {
  id: true,
  document_id: true,
  version_no: true,
  title: true,
  authors: true,
  description: true,
  publication_year: true,
  material_type: true,
  source_reference: true,
  rights_basis: true,
  download_allowed: true,
  review_status: true,
  revision: true,
  file_id: true,
  rights_valid_until: true,
  updated_at: true,
  files: {
    select: {
      scan_status: true,
      original_name: true,
      byte_size: true,
      page_count: true,
      has_text_layer: true,
    },
  },
  documents_document_versions_document_idTodocuments: { select: { kind: true } },
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
} satisfies Prisma.document_versionsSelect;
type DraftRow = Prisma.document_versionsGetPayload<{ select: typeof selection }>;
const kindFor = (actor: Profile) =>
  actor.role === 'LECTURER' ? 'LECTURER_MATERIAL' : 'STUDENT_SUPPLEMENT';
const conflict = (code: string, message: string) => new ConflictException({ code, message });

@Injectable()
export class MaterialsService {
  constructor(private readonly db: DatabaseService) {}
  async audit(tx: Prisma.TransactionClient, actorId: bigint, id: bigint, event: string) {
    await tx.audit_events.create({
      data: { actor_id: actorId, entity_type: 'DOCUMENT', entity_id: id, event_type: event },
    });
  }
  private owner(actor: Profile) {
    return { manager_id: academicId(actor.id), kind: kindFor(actor) };
  }
  private async begin(tx: Prisma.TransactionClient, actor: Profile) {
    const id = academicId(actor.id);
    await tx.$queryRaw`SELECT id FROM hucescholar.users WHERE id=${id} FOR SHARE`;
    const user = await tx.users.findUnique({
      where: { id },
      select: { role: true, status: true, verified_at: true },
    });
    if (
      !user ||
      user.role !== actor.role ||
      !['LECTURER', 'STUDENT'].includes(user.role) ||
      user.status !== 'ACTIVE' ||
      !user.verified_at
    )
      throw new ForbiddenException('Không còn quyền biên soạn.');
    // Same ordering and catalog lock as assignment changes: no revocation race.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(68467, 1)`;
    return id;
  }
  async checkCourses(tx: Prisma.TransactionClient, actor: Profile, ids: bigint[]) {
    const active = await tx.courses.count({
      where: { id: { in: ids }, is_active: true, faculties: { is_active: true } },
    });
    if (active !== ids.length)
      throw conflict('COURSE_UNAVAILABLE', 'Môn hoặc khoa không còn hoạt động.');
    if (
      actor.role === 'LECTURER' &&
      (await tx.lecturer_assignments.count({
        where: { lecturer_id: academicId(actor.id), course_id: { in: ids }, revoked_at: null },
      })) !== ids.length
    )
      throw conflict('ASSIGNMENT_REQUIRED', 'Cần phân công hiện hành cho tất cả môn của bản nháp.');
  }
  private fields(body: DraftFieldsDto) {
    return {
      title: body.title,
      authors: body.authors,
      description: body.description,
      material_type: body.materialType,
      source_reference: body.sourceReference,
      rights_basis: body.rightsBasis,
      download_allowed: body.downloadAllowed,
    };
  }
  private async serialize(tx: Prisma.TransactionClient, actor: Profile, rows: DraftRow[]) {
    const assigned =
      actor.role === 'LECTURER'
        ? new Set(
            (
              await tx.lecturer_assignments.findMany({
                where: {
                  lecturer_id: academicId(actor.id),
                  revoked_at: null,
                  course_id: {
                    in: rows.flatMap((r) => r.version_courses.map((v) => v.courses.id)),
                  },
                },
                select: { course_id: true },
              })
            ).map((a) => String(a.course_id)),
          )
        : null;
    return rows.map((row) => {
      const courses = row.version_courses
        .map(({ courses: c }) => ({
          id: String(c.id),
          code: c.code,
          name: c.name,
          active: c.is_active && c.faculties.is_active,
        }))
        .sort((a, b) => a.code.localeCompare(b.code));
      const editBlock =
        row.review_status !== 'DRAFT'
          ? 'NOT_DRAFT'
          : actor.role === 'LECTURER' && courses.some((c) => !c.active || !assigned?.has(c.id))
            ? 'ASSIGNMENT_REQUIRED'
            : null;
      return {
        id: String(row.document_id),
        versionId: String(row.id),
        versionNo: row.version_no,
        kind: row.documents_document_versions_document_idTodocuments.kind,
        title: row.title,
        authors: row.authors,
        description: row.description,
        materialType: row.material_type,
        sourceReference: row.source_reference,
        rightsBasis: row.rights_basis,
        downloadAllowed: row.download_allowed,
        reviewStatus: row.review_status,
        fileState: row.files?.scan_status ?? 'MISSING',
        pdf: row.files
          ? {
              name: row.files.original_name,
              byteSize: Number(row.files.byte_size),
              pageCount: row.files.page_count,
              hasTextLayer: row.files.has_text_layer,
            }
          : null,
        revision: row.revision,
        updatedAt: row.updated_at.toISOString(),
        courses,
        editable: editBlock === null,
        editBlock,
      };
    });
  }
  private async read(tx: Prisma.TransactionClient, actor: Profile, id: bigint) {
    const row = await tx.document_versions.findFirst({
      where: {
        document_id: id,
        documents_document_versions_document_idTodocuments: this.owner(actor),
      },
      orderBy: { version_no: 'desc' },
      select: selection,
    });
    if (!row) throw new NotFoundException('Không tìm thấy bản nháp.');
    return row;
  }
  async get(actor: Profile, rawId: string) {
    const id = academicId(rawId);
    return this.db.$transaction(
      async (tx) => ({
        item: (await this.serialize(tx, actor, [await this.read(tx, actor, id)]))[0],
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async list(actor: Profile, query: MaterialListDto) {
    // Select the latest snapshot before filtering; a published older version must
    // not appear as a second editable document while its successor is a draft.
    const latest = Prisma.sql`FROM (
      SELECT DISTINCT ON (v.document_id) v.id, v.title, v.review_status, v.updated_at
      FROM hucescholar.document_versions v JOIN hucescholar.documents d ON d.id=v.document_id
      WHERE d.manager_id=${academicId(actor.id)} AND d.kind=${kindFor(actor)}
      ORDER BY v.document_id, v.version_no DESC
    ) latest WHERE TRUE
      ${query.search ? Prisma.sql`AND latest.title ILIKE ${`%${query.search}%`}` : Prisma.empty}
      ${query.reviewStatus ? Prisma.sql`AND latest.review_status=${query.reviewStatus}` : Prisma.empty}`;
    return this.db.$transaction(
      async (tx) => {
        const ids = await tx.$queryRaw<{ id: bigint }[]>(Prisma.sql`SELECT latest.id ${latest}
          ORDER BY latest.updated_at DESC, latest.id DESC LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`);
        const rows = await tx.document_versions.findMany({
          where: { id: { in: ids.map((r) => r.id) } },
          select: selection,
          orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
        });
        const count = await tx.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT count(*) AS total ${latest}`,
        );
        return {
          items: await this.serialize(tx, actor, rows),
          total: Number(count[0].total),
          page: query.page,
          limit: query.limit,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async versions(actor: Profile, rawId: string, query: DraftListDto) {
    const document_id = academicId(rawId);
    return this.db.$transaction(
      async (tx) => {
        await this.read(tx, actor, document_id);
        const rows = await tx.document_versions.findMany({
          where: { document_id },
          select: selection,
          orderBy: { version_no: 'desc' },
          take: query.limit,
          skip: (query.page - 1) * query.limit,
        });
        return {
          items: await this.serialize(tx, actor, rows),
          total: await tx.document_versions.count({ where: { document_id } }),
          page: query.page,
          limit: query.limit,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async nextVersion(actor: Profile, rawId: string, body: SubmitMaterialDto) {
    return this.db.$transaction(async (tx) => {
      const { actorId, row, id } = await this.lockOwned(tx, actor, rawId, body.revision);
      if (!['APPROVED', 'REJECTED'].includes(row.review_status))
        throw conflict(
          'WORKING_VERSION_EXISTS',
          'Đã có phiên bản đang xử lý. Tải trạng thái để mở bản đó.',
        );
      if (row.version_no >= 2147483647 || row.revision >= 2147483646)
        throw conflict('VERSION_LIMIT', 'Đã đạt giới hạn phiên bản.');
      const ids = row.version_courses.map((c) => c.courses.id);
      await this.checkCourses(tx, actor, ids);
      await tx.document_versions.create({
        data: {
          document_id: id,
          version_no: row.version_no + 1,
          // Owner writes address the latest version by document ID. Never reuse
          // a predecessor's revision, including for delayed uploads/retries.
          revision: row.revision + 1,
          created_by: actorId,
          title: row.title,
          authors: row.authors,
          description: row.description,
          material_type: row.material_type,
          publication_year: row.publication_year,
          source_reference: '',
          rights_basis: '',
          download_allowed: false,
          version_courses: { create: ids.map((course_id) => ({ course_id })) },
        },
      });
      await tx.documents.update({
        where: { id },
        data: { revision: { increment: 1 }, updated_at: new Date() },
      });
      await this.audit(tx, actorId, id, 'MATERIAL_VERSION_CREATED');
      return { item: (await this.serialize(tx, actor, [await this.read(tx, actor, id)]))[0] };
    });
  }
  async courses(actor: Profile, query: DraftListDto) {
    const where: Prisma.coursesWhereInput = {
      is_active: true,
      faculties: { is_active: true },
      ...(actor.role === 'LECTURER'
        ? {
            lecturer_assignments: { some: { lecturer_id: academicId(actor.id), revoked_at: null } },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.db.$transaction(
      async (tx) => ({
        items: (
          await tx.courses.findMany({
            where,
            select: { id: true, code: true, name: true },
            orderBy: [{ code: 'asc' }, { id: 'asc' }],
            take: query.limit,
            skip: (query.page - 1) * query.limit,
          })
        ).map((c) => ({ ...c, id: String(c.id) })),
        total: await tx.courses.count({ where }),
        page: query.page,
        limit: query.limit,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async create(actor: Profile, body: DraftFieldsDto) {
    const ids = body.courseIds.map(academicId);
    return this.db.$transaction(async (tx) => {
      const actorId = await this.begin(tx, actor);
      await this.checkCourses(tx, actor, ids);
      const doc = await tx.documents.create({
        data: { kind: kindFor(actor), created_by: actorId, manager_id: actorId },
      });
      await tx.document_versions.create({
        data: {
          document_id: doc.id,
          version_no: 1,
          created_by: actorId,
          ...this.fields(body),
          version_courses: { create: ids.map((course_id) => ({ course_id })) },
        },
      });
      await this.audit(tx, actorId, doc.id, 'MATERIAL_DRAFT_CREATED');
      return { item: (await this.serialize(tx, actor, [await this.read(tx, actor, doc.id)]))[0] };
    });
  }
  async update(actor: Profile, rawId: string, body: UpdateDraftDto) {
    const id = academicId(rawId);
    const ids = body.courseIds.map(academicId);
    return this.db.$transaction(async (tx) => {
      const actorId = await this.begin(tx, actor);
      await tx.$queryRaw`SELECT id FROM hucescholar.documents WHERE id=${id} AND manager_id=${actorId} FOR UPDATE`;
      const row = await this.read(tx, actor, id);
      await tx.$queryRaw`SELECT id FROM hucescholar.document_versions WHERE id=${row.id} FOR UPDATE`;
      if (row.revision !== body.revision)
        throw conflict('STALE_REVISION', 'Bản nháp đã thay đổi. Tải thông tin mới để đối chiếu.');
      if (row.review_status !== 'DRAFT') throw conflict('NOT_DRAFT', 'Chỉ sửa bản nháp.');
      if (actor.role === 'LECTURER')
        await this.checkCourses(
          tx,
          actor,
          row.version_courses.map((c) => c.courses.id),
        );
      await this.checkCourses(tx, actor, ids);
      await tx.document_versions.update({
        where: { id: row.id },
        data: { ...this.fields(body), revision: { increment: 1 }, updated_at: new Date() },
      });
      await tx.version_courses.deleteMany({
        where: { version_id: row.id, course_id: { notIn: ids } },
      });
      await tx.version_courses.createMany({
        data: ids
          .filter((id) => !row.version_courses.some((c) => c.courses.id === id))
          .map((course_id) => ({ version_id: row.id, course_id })),
      });
      await tx.documents.update({
        where: { id },
        data: { revision: { increment: 1 }, updated_at: new Date() },
      });
      await this.audit(tx, actorId, id, 'MATERIAL_DRAFT_UPDATED');
      return { item: (await this.serialize(tx, actor, [await this.read(tx, actor, id)]))[0] };
    });
  }
  async lockDraft(tx: Prisma.TransactionClient, actor: Profile, rawId: string, revision: number) {
    const result = await this.lockOwned(tx, actor, rawId, revision);
    const { row } = result;
    if (row.review_status !== 'DRAFT') throw conflict('NOT_DRAFT', 'Chỉ thay PDF của bản nháp.');
    await this.checkCourses(
      tx,
      actor,
      row.version_courses.map((c) => c.courses.id),
    );
    return result;
  }
  private async lockOwned(
    tx: Prisma.TransactionClient,
    actor: Profile,
    rawId: string,
    revision: number,
  ) {
    const id = academicId(rawId);
    const actorId = await this.begin(tx, actor);
    await tx.$queryRaw`SELECT id FROM hucescholar.documents WHERE id=${id} AND manager_id=${actorId} FOR UPDATE`;
    const row = await this.read(tx, actor, id);
    await tx.$queryRaw`SELECT id FROM hucescholar.document_versions WHERE id=${row.id} FOR UPDATE`;
    if (row.revision !== revision)
      throw conflict(
        'STALE_REVISION',
        'Học liệu đã thay đổi. Tải trạng thái mới trước khi tiếp tục.',
      );
    return { actorId, row, id };
  }
  async submit(actor: Profile, rawId: string, body: SubmitMaterialDto) {
    return this.db.$transaction(async (tx) => {
      const { actorId, row, id } = await this.lockOwned(tx, actor, rawId, body.revision);
      if (row.review_status !== 'DRAFT') throw conflict('NOT_DRAFT', 'Chỉ gửi bản nháp.');
      if (
        !row.title.trim() ||
        !row.source_reference.trim() ||
        !row.rights_basis.trim() ||
        !row.version_courses.length
      )
        throw conflict(
          'METADATA_REQUIRED',
          'Bổ sung thông tin, nguồn, quyền và môn trước khi gửi.',
        );
      if (row.rights_valid_until && row.rights_valid_until <= new Date())
        throw conflict('RIGHTS_EXPIRED', 'Căn cứ quyền sử dụng đã hết hạn.');
      await this.checkCourses(
        tx,
        actor,
        row.version_courses.map((c) => c.courses.id),
      );
      if (row.file_id)
        await tx.$queryRaw`SELECT id FROM hucescholar.files WHERE id=${row.file_id} FOR SHARE`;
      const file = row.file_id ? await tx.files.findUnique({ where: { id: row.file_id } }) : null;
      if (!file || file.scan_status !== 'SAFE')
        throw conflict('FILE_NOT_SAFE', 'PDF phải qua kiểm tra kỹ thuật trước khi gửi.');
      const revision = row.revision + 1;
      await tx.document_versions.update({
        where: { id: row.id },
        data: { review_status: 'SUBMITTED', revision, updated_at: new Date() },
      });
      await tx.publication_requests.create({
        data: { version_id: row.id, submitted_by: actorId, submitted_revision: revision },
      });
      await tx.documents.update({
        where: { id },
        data: { revision: { increment: 1 }, updated_at: new Date() },
      });
      await this.audit(tx, actorId, id, 'MATERIAL_SUBMITTED');
      return { item: (await this.serialize(tx, actor, [await this.read(tx, actor, id)]))[0] };
    });
  }
  async withdraw(actor: Profile, rawId: string, body: WithdrawMaterialDto) {
    return this.db.$transaction(async (tx) => {
      const { actorId, row, id } = await this.lockOwned(tx, actor, rawId, body.revision);
      if (row.review_status !== 'SUBMITTED')
        throw conflict('NOT_SUBMITTED', 'Học liệu không còn chờ duyệt.');
      await tx.$queryRaw`SELECT id FROM hucescholar.publication_requests WHERE version_id=${row.id} AND status='PENDING' FOR UPDATE`;
      const pending = await tx.publication_requests.findFirst({
        where: { version_id: row.id, status: 'PENDING' },
      });
      if (!pending || pending.submitted_revision !== row.revision)
        throw conflict('REQUEST_CHANGED', 'Yêu cầu duyệt đã thay đổi. Tải trạng thái mới.');
      await tx.publication_requests.update({
        where: { id: pending.id },
        data: {
          status: 'WITHDRAWN',
          resolved_by: actorId,
          resolved_at: new Date(),
          reason: body.reason,
          revision: { increment: 1 },
        },
      });
      await tx.document_versions.update({
        where: { id: row.id },
        data: { review_status: 'DRAFT', revision: { increment: 1 }, updated_at: new Date() },
      });
      await tx.documents.update({
        where: { id },
        data: { revision: { increment: 1 }, updated_at: new Date() },
      });
      await this.audit(tx, actorId, id, 'MATERIAL_WITHDRAWN');
      return { item: (await this.serialize(tx, actor, [await this.read(tx, actor, id)]))[0] };
    });
  }
  async reopen(actor: Profile, rawId: string, body: SubmitMaterialDto) {
    return this.db.$transaction(async (tx) => {
      const { actorId, row, id } = await this.lockOwned(tx, actor, rawId, body.revision);
      if (row.review_status !== 'CHANGES_REQUIRED')
        throw conflict('NOT_CHANGES_REQUIRED', 'Chỉ mở lại phiên bản được yêu cầu sửa.');
      await this.checkCourses(
        tx,
        actor,
        row.version_courses.map((c) => c.courses.id),
      );
      await tx.document_versions.update({
        where: { id: row.id },
        data: { review_status: 'DRAFT', revision: { increment: 1 }, updated_at: new Date() },
      });
      await tx.documents.update({
        where: { id },
        data: { revision: { increment: 1 }, updated_at: new Date() },
      });
      await this.audit(tx, actorId, id, 'MATERIAL_REOPENED');
      return { item: (await this.serialize(tx, actor, [await this.read(tx, actor, id)]))[0] };
    });
  }
  async history(actor: Profile, rawId: string, query: MaterialHistoryDto) {
    const id = academicId(rawId);
    return this.db.$transaction(
      async (tx) => {
        const row = await this.read(tx, actor, id);
        const versionId = query.versionId ? academicId(query.versionId) : row.id;
        if (
          query.versionId &&
          !(await tx.document_versions.findFirst({
            where: { id: versionId, document_id: id },
            select: { id: true },
          }))
        )
          throw new NotFoundException('Không tìm thấy phiên bản của tài liệu.');
        const where = { version_id: versionId };
        const items = await tx.publication_requests.findMany({
          where,
          orderBy: [{ submitted_at: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        });
        return {
          items: items.map((r) => ({
            id: String(r.id),
            submittedRevision: r.submitted_revision,
            submittedAt: r.submitted_at.toISOString(),
            status: r.status,
            resolvedAt: r.resolved_at?.toISOString() ?? null,
            reason: r.reason,
          })),
          total: await tx.publication_requests.count({ where }),
          page: query.page,
          limit: query.limit,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
