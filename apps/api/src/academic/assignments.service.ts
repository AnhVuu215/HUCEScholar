import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { Prisma } from '../generated/prisma/client';
import { AcademicService, academicId } from './academic.service';
import { CreateAssignmentDto, ListAssignmentsDto, RevokeAssignmentDto } from './assignments.dto';

type AssignmentRow = {
  id: string;
  lecturerId: string;
  lecturerName: string;
  lecturerEmail: string;
  lecturerActive: boolean;
  courseId: string;
  courseCode: string;
  courseName: string;
  courseActive: boolean;
  facultyName: string;
  assignedAt: Date;
  revokedAt: Date | null;
  reason: string | null;
};
const selection = Prisma.sql`a.id::text, a.lecturer_id::text AS "lecturerId", u.display_name AS "lecturerName", u.email AS "lecturerEmail", (u.status='ACTIVE' AND u.verified_at IS NOT NULL AND u.role='LECTURER') AS "lecturerActive", a.course_id::text AS "courseId", c.code AS "courseCode", c.name AS "courseName", (c.is_active AND f.is_active) AS "courseActive", f.name AS "facultyName", a.assigned_at AS "assignedAt", a.revoked_at AS "revokedAt", a.reason`;
const joins = Prisma.sql`hucescholar.lecturer_assignments a JOIN hucescholar.users u ON u.id=a.lecturer_id JOIN hucescholar.courses c ON c.id=a.course_id JOIN hucescholar.faculties f ON f.id=c.faculty_id`;
const serialize = (row: AssignmentRow) => ({
  ...row,
  assignedAt: row.assignedAt.toISOString(),
  revokedAt: row.revokedAt?.toISOString() ?? null,
});
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly academic: AcademicService,
  ) {}
  async list(query: ListAssignmentsDto, ownId?: string) {
    const predicates = [Prisma.sql`true`];
    if (ownId || query.lecturerId)
      predicates.push(Prisma.sql`a.lecturer_id=${academicId(ownId ?? query.lecturerId!)}`);
    if (query.courseId) predicates.push(Prisma.sql`a.course_id=${academicId(query.courseId)}`);
    if (query.status)
      predicates.push(
        query.status === 'ACTIVE'
          ? Prisma.sql`a.revoked_at IS NULL`
          : Prisma.sql`a.revoked_at IS NOT NULL`,
      );
    if (query.search)
      predicates.push(
        Prisma.sql`(strpos(lower(c.code),lower(${query.search}))>0 OR strpos(lower(c.name),lower(${query.search}))>0 OR strpos(lower(u.display_name),lower(${query.search}))>0 OR strpos(lower(u.email),lower(${query.search}))>0)`,
      );
    const where = Prisma.join(predicates, ' AND ');
    const [rows, count] = await this.db.$transaction(
      [
        this.db.$queryRaw<AssignmentRow[]>(
          Prisma.sql`SELECT ${selection} FROM ${joins} WHERE ${where} ORDER BY a.id DESC LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
        ),
        this.db.$queryRaw<{ total: number }[]>(
          Prisma.sql`SELECT count(*)::int total FROM ${joins} WHERE ${where}`,
        ),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: rows.map(serialize),
      total: count[0].total,
      page: query.page,
      limit: query.limit,
    };
  }
  private async read(tx: Prisma.TransactionClient, id: bigint) {
    const rows = await tx.$queryRaw<AssignmentRow[]>(
      Prisma.sql`SELECT ${selection} FROM ${joins} WHERE a.id=${id}`,
    );
    if (!rows[0]) throw new NotFoundException('Không tìm thấy phân công.');
    return serialize(rows[0]);
  }
  async create(actor: string, body: CreateAssignmentDto) {
    const lecturerId = academicId(body.lecturerId);
    const courseId = academicId(body.courseId);
    return this.db.$transaction(async (tx) => {
      const actorId = await this.academic.beginWrite(tx, actor);
      await tx.$queryRaw`SELECT id FROM hucescholar.courses WHERE id=${courseId} FOR SHARE`;
      const course = await tx.courses.findUnique({
        where: { id: courseId },
        select: { is_active: true, faculty_id: true },
      });
      if (!course) throw new NotFoundException('Không tìm thấy môn học.');
      if (!course.is_active)
        throw new ConflictException({ code: 'INACTIVE_COURSE', message: 'Môn đã ngừng sử dụng.' });
      await this.academic.activeFaculty(tx, course.faculty_id);
      await tx.$queryRaw`SELECT id FROM hucescholar.users WHERE id=${lecturerId} FOR SHARE`;
      const lecturer = await tx.users.findUnique({
        where: { id: lecturerId },
        select: { role: true, status: true, verified_at: true },
      });
      if (
        !lecturer ||
        lecturer.role !== 'LECTURER' ||
        lecturer.status !== 'ACTIVE' ||
        !lecturer.verified_at
      )
        throw new ConflictException({
          code: 'INVALID_LECTURER',
          message: 'Cần giảng viên hoạt động và đã xác minh.',
        });
      if (
        await tx.lecturer_assignments.findFirst({
          where: { lecturer_id: lecturerId, course_id: courseId, revoked_at: null },
          select: { id: true },
        })
      )
        throw new ConflictException({
          code: 'ALREADY_ASSIGNED',
          message: 'Giảng viên đã được phân công môn này.',
        });
      const row = await tx.lecturer_assignments.create({
        data: { lecturer_id: lecturerId, course_id: courseId, assigned_by: actorId },
      });
      await this.academic.audit(tx, actorId, 'LECTURER_ASSIGNMENT', row.id, 'ASSIGNMENT_CREATED');
      return { item: await this.read(tx, row.id) };
    });
  }
  async revoke(actor: string, rawId: string, body: RevokeAssignmentDto) {
    const id = academicId(rawId);
    return this.db.$transaction(async (tx) => {
      const actorId = await this.academic.beginWrite(tx, actor);
      await tx.$queryRaw`SELECT id FROM hucescholar.lecturer_assignments WHERE id=${id} FOR UPDATE`;
      const row = await tx.lecturer_assignments.findUnique({
        where: { id },
        select: { revoked_at: true },
      });
      if (!row) throw new NotFoundException('Không tìm thấy phân công.');
      if (row.revoked_at)
        throw new ConflictException({
          code: 'ALREADY_REVOKED',
          message: 'Phân công đã được thu hồi. Tải lại danh sách.',
        });
      await tx.$executeRaw`UPDATE hucescholar.lecturer_assignments SET revoked_at=greatest(clock_timestamp(),assigned_at), revoked_by=${actorId}, reason=${body.reason} WHERE id=${id}`;
      await this.academic.audit(tx, actorId, 'LECTURER_ASSIGNMENT', id, 'ASSIGNMENT_REVOKED');
      return { item: await this.read(tx, id) };
    });
  }
}
