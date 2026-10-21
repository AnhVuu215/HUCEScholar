import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { Prisma } from '../generated/prisma/client';
import { academicId } from '../academic/academic.service';
import { Profile } from '../auth/auth.types';
import { available } from '../materials/library.service';
import { SaveReadingListDto } from './reading-lists.dto';

const fail = (code: string, message: string) => new ConflictException({ code, message });
const listSelect = {
  id: true,
  course_id: true,
  title: true,
  published: true,
  revision: true,
  updated_at: true,
  users: { select: { id: true, display_name: true } },
  reading_list_items: {
    select: { position: true, section: true, note: true, version_id: true },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.reading_listsSelect;
type ListRow = Prisma.reading_listsGetPayload<{ select: typeof listSelect }>;

/**
 * COURSE-01. Lecturers edit their own list for a course they are assigned to; any reader sees
 * published lists whose owner is still assigned. Items the viewer cannot read are shown as
 * unavailable without their title, so a list never reveals hidden material.
 */
@Injectable()
export class ReadingListsService {
  constructor(private readonly db: DatabaseService) {}

  private async reader(tx: Prisma.TransactionClient, actor: Profile) {
    const id = academicId(actor.id);
    await tx.$queryRaw`SELECT id FROM hucescholar.users WHERE id=${id} FOR SHARE`;
    const user = await tx.users.findUnique({ where: { id } });
    if (!user || user.status !== 'ACTIVE' || !user.verified_at)
      throw new ForbiddenException('Tài khoản không còn quyền đọc.');
    return user;
  }
  private async activeCourse(tx: Prisma.TransactionClient, courseId: bigint) {
    const course = await tx.courses.findFirst({
      where: { id: courseId, is_active: true, faculties: { is_active: true } },
      select: { id: true, code: true, name: true },
    });
    if (!course) throw new NotFoundException('Không tìm thấy môn học.');
    return course;
  }
  private async assigned(tx: Prisma.TransactionClient, actor: Profile, courseId: bigint) {
    const user = await this.reader(tx, actor);
    if (user.role !== 'LECTURER')
      throw new ForbiddenException('Chỉ giảng viên được phân công soạn danh sách đọc.');
    await this.activeCourse(tx, courseId);
    const assignment = await tx.lecturer_assignments.count({
      where: { lecturer_id: user.id, course_id: courseId, revoked_at: null },
    });
    if (!assignment)
      throw fail('ASSIGNMENT_REQUIRED', 'Cần phân công hiện hành cho môn này để soạn danh sách.');
    return user;
  }
  /** Title, authors and links only for versions the viewer can read right now. */
  private async serialize(tx: Prisma.TransactionClient, list: ListRow) {
    const ids = list.reading_list_items.map((i) => i.version_id);
    const readable = await tx.document_versions.findMany({
      where: { AND: [{ id: { in: ids } }, available()] },
      select: {
        id: true,
        title: true,
        authors: true,
        version_no: true,
        material_type: true,
        documents_document_versions_document_idTodocuments: {
          select: { current_version_id: true },
        },
      },
    });
    const currents = readable
      .map((v) => v.documents_document_versions_document_idTodocuments.current_version_id)
      .filter((id): id is bigint => !!id);
    const readableCurrent = new Set(
      (
        await tx.document_versions.findMany({
          where: { AND: [{ id: { in: currents } }, available()] },
          select: { id: true },
        })
      ).map((v) => v.id),
    );
    const byId = new Map(readable.map((v) => [v.id, v]));
    return {
      id: String(list.id),
      courseId: String(list.course_id),
      title: list.title,
      published: list.published,
      revision: list.revision,
      updatedAt: list.updated_at.toISOString(),
      owner: { id: String(list.users.id), name: list.users.display_name },
      items: list.reading_list_items.map((item) => {
        const v = byId.get(item.version_id);
        const current = v?.documents_document_versions_document_idTodocuments.current_version_id;
        return {
          position: item.position,
          section: item.section,
          note: item.note,
          versionId: String(item.version_id),
          material: v
            ? {
                title: v.title,
                authors: v.authors,
                versionNo: v.version_no,
                materialType: v.material_type,
                newerVersionId:
                  current && current !== v.id && readableCurrent.has(current)
                    ? String(current)
                    : null,
              }
            : null,
        };
      }),
    };
  }

  async published(actor: Profile, rawCourseId: string) {
    const courseId = academicId(rawCourseId);
    return this.db.$transaction(
      async (tx) => {
        await this.reader(tx, actor);
        const course = await this.activeCourse(tx, courseId);
        const lists = await tx.reading_lists.findMany({
          where: {
            course_id: courseId,
            published: true,
            users: {
              status: 'ACTIVE',
              lecturer_assignments_lecturer_assignments_lecturer_idTousers: {
                some: { course_id: courseId, revoked_at: null },
              },
            },
          },
          select: listSelect,
          orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
        });
        const items = [];
        for (const list of lists) items.push(await this.serialize(tx, list));
        return { course: { id: String(course.id), code: course.code, name: course.name }, items };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async mine(actor: Profile, rawCourseId: string) {
    const courseId = academicId(rawCourseId);
    return this.db.$transaction(
      async (tx) => {
        const user = await this.assigned(tx, actor, courseId);
        const list = await tx.reading_lists.findUnique({
          where: { course_id_owner_id: { course_id: courseId, owner_id: user.id } },
          select: listSelect,
        });
        return { item: list ? await this.serialize(tx, list) : null };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async save(actor: Profile, rawCourseId: string, body: SaveReadingListDto) {
    const courseId = academicId(rawCourseId);
    return this.db.$transaction(async (tx) => {
      const user = await this.assigned(tx, actor, courseId);
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`hucescholar:reading-list:${courseId}:${user.id}`}, 0))`;
      const existing = await tx.reading_lists.findUnique({
        where: { course_id_owner_id: { course_id: courseId, owner_id: user.id } },
      });
      if ((existing?.revision ?? 0) !== body.revision)
        throw fail('STALE_REVISION', 'Danh sách đã thay đổi ở lượt khác. Tải lại trước khi lưu.');
      const versionIds = body.items.map((i) => academicId(i.versionId));
      const distinct = [...new Set(versionIds)];
      if (distinct.length !== versionIds.length)
        throw fail('DUPLICATE_ITEM', 'Mỗi phiên bản chỉ xuất hiện một lần trong danh sách.');
      // Only material that belongs to this course and that its readers can open now.
      const valid = await tx.document_versions.count({
        where: {
          AND: [
            { id: { in: distinct } },
            available(),
            { version_courses: { some: { course_id: courseId } } },
          ],
        },
      });
      if (valid !== distinct.length)
        throw fail(
          'ITEM_UNAVAILABLE',
          'Có tài liệu không thuộc môn này hoặc không còn đọc được. Tải lại rồi chọn lại.',
        );
      const now = new Date();
      const list = existing
        ? await tx.reading_lists.update({
            where: { id: existing.id },
            data: {
              title: body.title,
              published: body.published,
              revision: { increment: 1 },
              updated_at: now,
            },
          })
        : await tx.reading_lists.create({
            data: {
              course_id: courseId,
              owner_id: user.id,
              title: body.title,
              published: body.published,
            },
          });
      await tx.reading_list_items.deleteMany({ where: { list_id: list.id } });
      if (body.items.length)
        await tx.reading_list_items.createMany({
          data: body.items.map((item, index) => ({
            list_id: list.id,
            position: index + 1,
            section: item.section,
            version_id: versionIds[index],
            note: item.note,
          })),
        });
      await tx.audit_events.create({
        data: {
          actor_id: user.id,
          entity_type: 'READING_LIST',
          entity_id: list.id,
          event_type: existing ? 'READING_LIST_UPDATED' : 'READING_LIST_CREATED',
        },
      });
      const saved = await tx.reading_lists.findUniqueOrThrow({
        where: { id: list.id },
        select: listSelect,
      });
      return { item: await this.serialize(tx, saved) };
    });
  }
}
