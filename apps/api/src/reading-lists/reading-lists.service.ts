import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { Prisma } from '../generated/prisma/client';
import { academicId } from '../academic/academic.service';
import { Profile } from '../auth/auth.types';
import { formatDate, parseDate } from '../calendar/calendar-repeat';
import { available } from '../materials/library.service';
import {
  FollowReadingListsDto,
  ReadingDeadlinesDto,
  ReadMarkDto,
  SaveReadingListDto,
} from './reading-lists.dto';

const fail = (code: string, message: string) => new ConflictException({ code, message });
const invalid = (message: string) =>
  new BadRequestException({ code: 'READING_LIST_INVALID', message });
const DAY = 86_400_000;
const MAX_DEADLINE_DAYS = 62;
const MAX_DEADLINES = 500;
const FIRST_DUE = Date.UTC(2000, 0, 1);
const LAST_DUE = Date.UTC(2100, 11, 31);
/** A real calendar day inside the range the database CHECK allows. */
function dueDate(value: string | null) {
  if (value === null) return null;
  const date = parseDate(value);
  if (!date || date.getTime() < FIRST_DUE || date.getTime() > LAST_DUE)
    throw invalid('Hạn đọc phải là một ngày hợp lệ.');
  return date;
}
/** Published lists of a course whose owner is still active and assigned to that course. */
const shown = (courseId: bigint) =>
  ({
    published: true,
    users: {
      status: 'ACTIVE',
      lecturer_assignments_lecturer_assignments_lecturer_idTousers: {
        some: { course_id: courseId, revoked_at: null },
      },
    },
  }) satisfies Prisma.reading_listsWhereInput;
const listSelect = {
  id: true,
  course_id: true,
  title: true,
  published: true,
  revision: true,
  updated_at: true,
  users: { select: { id: true, display_name: true } },
  reading_list_items: {
    select: { position: true, section: true, note: true, version_id: true, due_on: true },
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
  /**
   * Title, authors and links only for versions the viewer can read right now, and the viewer's
   * own "đã đọc" marks (COURSE-02) on those; a mark on a hidden version reads as unread.
   */
  private async serialize(tx: Prisma.TransactionClient, list: ListRow, viewerId: bigint) {
    const ids = list.reading_list_items.map((i) => i.version_id);
    const marked = new Set(
      (
        await tx.reading_marks.findMany({
          where: { user_id: viewerId, version_id: { in: ids } },
          select: { version_id: true },
        })
      ).map((m) => m.version_id),
    );
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
          dueOn: item.due_on ? formatDate(item.due_on) : null,
          versionId: String(item.version_id),
          read: !!v && marked.has(item.version_id),
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
        const user = await this.reader(tx, actor);
        const course = await this.activeCourse(tx, courseId);
        const lists = await tx.reading_lists.findMany({
          where: { course_id: courseId, ...shown(courseId) },
          select: listSelect,
          orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
        });
        const items = [];
        for (const list of lists) items.push(await this.serialize(tx, list, user.id));
        const following = await tx.reading_list_follows.count({
          where: { user_id: user.id, course_id: courseId },
        });
        return {
          course: { id: String(course.id), code: course.code, name: course.name },
          following: following > 0,
          items,
        };
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
        return { item: list ? await this.serialize(tx, list, user.id) : null };
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
      const dues = body.items.map((i) => dueDate(i.dueOn));
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
            due_on: dues[index],
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
      return { item: await this.serialize(tx, saved, user.id) };
    });
  }

  /** CAL-04b. A private opt-in to see this course's due dates on one's own calendar. */
  async follow(actor: Profile, rawCourseId: string, body: FollowReadingListsDto) {
    const courseId = academicId(rawCourseId);
    return this.db.$transaction(async (tx) => {
      const user = await this.reader(tx, actor);
      if (body.following) {
        await this.activeCourse(tx, courseId);
        await tx.reading_list_follows.upsert({
          where: { user_id_course_id: { user_id: user.id, course_id: courseId } },
          create: { user_id: user.id, course_id: courseId },
          update: {},
        });
      } else
        await tx.reading_list_follows.deleteMany({
          where: { user_id: user.id, course_id: courseId },
        });
      return { following: body.following };
    });
  }

  /**
   * COURSE-02. The reader's private "đã đọc" mark on a version that a shown list of this active
   * course names and that the reader can open now; anything else is the same 404, so the
   * endpoint never confirms a hidden version. Unmarking is allowed under the same check.
   */
  async markRead(actor: Profile, rawCourseId: string, rawVersionId: string, body: ReadMarkDto) {
    const courseId = academicId(rawCourseId);
    const versionId = academicId(rawVersionId);
    return this.db.$transaction(async (tx) => {
      const user = await this.reader(tx, actor);
      await this.activeCourse(tx, courseId);
      const listed = await tx.reading_list_items.count({
        where: {
          version_id: versionId,
          document_versions: available(),
          reading_lists: { course_id: courseId, ...shown(courseId) },
        },
      });
      if (!listed) throw new NotFoundException('Không tìm thấy mục này trong danh sách đọc.');
      if (body.read)
        await tx.reading_marks.upsert({
          where: { user_id_version_id: { user_id: user.id, version_id: versionId } },
          create: { user_id: user.id, version_id: versionId },
          update: {},
        });
      else
        await tx.reading_marks.deleteMany({ where: { user_id: user.id, version_id: versionId } });
      return { versionId: String(versionId), read: body.read };
    });
  }

  /**
   * The home "Danh sách đọc đang theo dõi": for each active course the reader follows, how many
   * distinct listed versions they have marked read out of those they can open now, and the
   * earliest due date among the unread ones. Hidden versions are left out of both, as in COURSE-02.
   * Courses come nearest due date first (COURSE-02c).
   */
  async following(actor: Profile) {
    return this.db.$transaction(
      async (tx) => {
        const user = await this.reader(tx, actor);
        const followed = await tx.reading_list_follows.findMany({
          where: {
            user_id: user.id,
            courses: { is_active: true, faculties: { is_active: true } },
          },
          select: { courses: { select: { id: true, code: true, name: true } } },
          orderBy: { courses: { code: 'asc' } },
        });
        const rows = followed.length
          ? await tx.reading_list_items.findMany({
              where: {
                document_versions: available(),
                reading_lists: {
                  OR: followed.map((f) => ({ course_id: f.courses.id, ...shown(f.courses.id) })),
                },
              },
              select: {
                due_on: true,
                version_id: true,
                document_versions: { select: { title: true } },
                reading_lists: { select: { course_id: true } },
              },
              orderBy: [{ list_id: 'asc' }, { position: 'asc' }],
            })
          : [];
        const marked = new Set(
          (
            await tx.reading_marks.findMany({
              where: { user_id: user.id, version_id: { in: rows.map((r) => r.version_id) } },
              select: { version_id: true },
            })
          ).map((m) => m.version_id),
        );
        const items = followed.map(({ courses: course }) => {
          const own = rows.filter((r) => r.reading_lists.course_id === course.id);
          const versions = new Set(own.map((r) => r.version_id));
          let next: (typeof own)[number] | undefined;
          for (const r of own)
            if (r.due_on && !marked.has(r.version_id) && (!next || r.due_on < next.due_on!))
              next = r;
          return {
            course: { id: String(course.id), code: course.code, name: course.name },
            total: versions.size,
            read: [...versions].filter((v) => marked.has(v)).length,
            next: next
              ? {
                  dueOn: formatDate(next.due_on!),
                  versionId: String(next.version_id),
                  title: next.document_versions.title,
                }
              : null,
          };
        });
        // Most urgent first: nearest unread due date (overdue ones lead), then courses with nothing
        // due. The sort is stable, so ties keep course-code order; YYYY-MM-DD sorts as text.
        items.sort((a, b) =>
          a.next && b.next
            ? a.next.dueOn.localeCompare(b.next.dueOn)
            : Number(!a.next) - Number(!b.next),
        );
        return { items };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  /**
   * Due dates in [from, to) on the published lists of active courses the reader follows. Items
   * the reader cannot open are left out, so a deadline never reveals a hidden title.
   */
  async deadlines(actor: Profile, query: ReadingDeadlinesDto) {
    const from = parseDate(query.from),
      to = parseDate(query.to);
    if (!from || !to || to <= from || to.getTime() - from.getTime() > MAX_DEADLINE_DAYS * DAY)
      throw invalid(`Khoảng xem phải từ 1 tới ${MAX_DEADLINE_DAYS} ngày.`);
    return this.db.$transaction(
      async (tx) => {
        const user = await this.reader(tx, actor);
        const followed = await tx.reading_list_follows.findMany({
          where: {
            user_id: user.id,
            courses: { is_active: true, faculties: { is_active: true } },
          },
          select: { course_id: true },
        });
        const rows = followed.length
          ? await tx.reading_list_items.findMany({
              where: {
                due_on: { gte: from, lt: to },
                document_versions: available(),
                reading_lists: {
                  OR: followed.map((f) => ({ course_id: f.course_id, ...shown(f.course_id) })),
                },
              },
              select: {
                due_on: true,
                position: true,
                section: true,
                version_id: true,
                document_versions: { select: { title: true } },
                reading_lists: {
                  select: {
                    id: true,
                    title: true,
                    courses: { select: { id: true, code: true, name: true } },
                  },
                },
              },
              orderBy: [{ due_on: 'asc' }, { list_id: 'asc' }, { position: 'asc' }],
              take: MAX_DEADLINES + 1,
            })
          : [];
        const shownRows = rows.slice(0, MAX_DEADLINES);
        // CAL-04c: the reader's own COURSE-02 marks, so a read item looks done on the calendar.
        const marked = new Set(
          (
            await tx.reading_marks.findMany({
              where: { user_id: user.id, version_id: { in: shownRows.map((r) => r.version_id) } },
              select: { version_id: true },
            })
          ).map((m) => m.version_id),
        );
        return {
          items: shownRows.map((r) => ({
            dueOn: formatDate(r.due_on!),
            listId: String(r.reading_lists.id),
            listTitle: r.reading_lists.title,
            course: {
              id: String(r.reading_lists.courses.id),
              code: r.reading_lists.courses.code,
              name: r.reading_lists.courses.name,
            },
            position: r.position,
            section: r.section,
            versionId: String(r.version_id),
            title: r.document_versions.title,
            read: marked.has(r.version_id),
          })),
          truncated: rows.length > MAX_DEADLINES,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
