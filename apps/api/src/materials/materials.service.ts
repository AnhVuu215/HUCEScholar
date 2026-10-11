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
import { DraftFieldsDto, DraftListDto, UpdateDraftDto } from './materials.dto';

const selection = {
  id: true,
  document_id: true,
  version_no: true,
  title: true,
  authors: true,
  description: true,
  material_type: true,
  source_reference: true,
  rights_basis: true,
  download_allowed: true,
  review_status: true,
  revision: true,
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
  private async checkCourses(tx: Prisma.TransactionClient, actor: Profile, ids: bigint[]) {
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
  async list(actor: Profile, query: DraftListDto) {
    const where: Prisma.document_versionsWhereInput = {
      review_status: 'DRAFT',
      documents_document_versions_document_idTodocuments: this.owner(actor),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.document_versions.findMany({
          where,
          select: selection,
          orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
          take: query.limit,
          skip: (query.page - 1) * query.limit,
        });
        return {
          items: await this.serialize(tx, actor, rows),
          total: await tx.document_versions.count({ where }),
          page: query.page,
          limit: query.limit,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
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
    const id = academicId(rawId);
    const actorId = await this.begin(tx, actor);
    await tx.$queryRaw`SELECT id FROM hucescholar.documents WHERE id=${id} AND manager_id=${actorId} FOR UPDATE`;
    const row = await this.read(tx, actor, id);
    await tx.$queryRaw`SELECT id FROM hucescholar.document_versions WHERE id=${row.id} FOR UPDATE`;
    if (row.revision !== revision)
      throw conflict('STALE_REVISION', 'Bản nháp đã thay đổi. Mở lại trước khi tải PDF lên.');
    if (row.review_status !== 'DRAFT') throw conflict('NOT_DRAFT', 'Chỉ thay PDF của bản nháp.');
    await this.checkCourses(
      tx,
      actor,
      row.version_courses.map((c) => c.courses.id),
    );
    return { actorId, row, id };
  }
}
