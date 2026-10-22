import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { Prisma, type calendar_items } from '../generated/prisma/client';
import { academicId } from '../academic/academic.service';
import { Profile } from '../auth/auth.types';
import { available } from '../materials/library.service';
import {
  CalendarDoneDto,
  CalendarFieldsDto,
  CalendarRangeDto,
  CalendarRevisionDto,
  CalendarTasksDto,
  CreateCalendarItemDto,
  UpdateCalendarItemDto,
} from './calendar.dto';

const DAY = 86_400_000;
const MAX_RANGE_DAYS = 62;
const MAX_EVENT_DAYS = 14;
const MAX_RANGE_ITEMS = 500;
const stale = () =>
  new ConflictException({
    code: 'CALENDAR_CONFLICT',
    message: 'Mục lịch đã thay đổi ở lượt khác. Tải lại trước khi cập nhật.',
  });
const invalid = (message: string) => new BadRequestException({ code: 'CALENDAR_INVALID', message });
type Source = { title: string; pageCount: number };

/** Times and source shape the database CHECKs also enforce, with readable messages first. */
function normalize(body: CalendarFieldsDto) {
  const startsAt = body.startsAt === null ? null : new Date(body.startsAt);
  const endsAt = body.endsAt === null ? null : new Date(body.endsAt);
  if (body.kind === 'EVENT') {
    if (!startsAt || !endsAt) throw invalid('Lịch học cần giờ bắt đầu và kết thúc.');
    if (endsAt <= startsAt) throw invalid('Giờ kết thúc phải sau giờ bắt đầu.');
    if (endsAt.getTime() - startsAt.getTime() > MAX_EVENT_DAYS * DAY)
      throw invalid(`Một lịch học kéo dài tối đa ${MAX_EVENT_DAYS} ngày.`);
  } else {
    if (endsAt) throw invalid('Việc cần làm chỉ có hạn, không có giờ kết thúc.');
    if (!startsAt && body.allDay) throw invalid('Việc chưa có ngày không thể là cả ngày.');
  }
  if ((body.versionId === null) !== (body.pageNumber === null))
    throw invalid('Chọn cả tài liệu và số trang, hoặc bỏ cả hai.');
  return {
    kind: body.kind,
    title: body.title,
    details: body.details,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: body.allDay,
    color: body.color,
    version_id: body.versionId === null ? null : academicId(body.versionId),
    page_number: body.pageNumber,
  };
}
type Fields = ReturnType<typeof normalize>;
const sameFields = (row: calendar_items, fields: Fields) =>
  row.kind === fields.kind &&
  row.title === fields.title &&
  row.details === fields.details &&
  row.starts_at?.getTime() === fields.starts_at?.getTime() &&
  row.ends_at?.getTime() === fields.ends_at?.getTime() &&
  row.all_day === fields.all_day &&
  row.color === fields.color &&
  row.version_id === fields.version_id &&
  row.page_number === fields.page_number;

/**
 * CAL-01. A private calendar: only the owner reads or writes. Linked material is shown only while
 * the owner can read that version; otherwise the item stays but the link is withheld.
 */
@Injectable()
export class CalendarService {
  constructor(private readonly db: DatabaseService) {}

  private async sources(tx: Prisma.TransactionClient, ids: bigint[]) {
    const rows = ids.length
      ? await tx.document_versions.findMany({
          where: { AND: [{ id: { in: [...new Set(ids)] } }, available()] },
          select: { id: true, title: true, files: { select: { page_count: true } } },
        })
      : [];
    return new Map<bigint, Source>(
      rows.map((r) => [r.id, { title: r.title, pageCount: r.files?.page_count ?? 0 }]),
    );
  }
  private async serialize(tx: Prisma.TransactionClient, rows: calendar_items[]) {
    const sources = await this.sources(
      tx,
      rows.flatMap((r) => (r.version_id ? [r.version_id] : [])),
    );
    return rows.map((r) => {
      const source = r.version_id ? sources.get(r.version_id) : undefined;
      return {
        id: String(r.id),
        kind: r.kind as 'EVENT' | 'TASK',
        title: r.title,
        details: r.details,
        startsAt: r.starts_at?.toISOString() ?? null,
        endsAt: r.ends_at?.toISOString() ?? null,
        allDay: r.all_day,
        color: r.color,
        done: r.done_at !== null,
        material:
          source && r.page_number
            ? { versionId: String(r.version_id), pageNumber: r.page_number, title: source.title }
            : null,
        materialUnavailable: r.version_id !== null && !source,
        revision: r.revision,
        updatedAt: r.updated_at.toISOString(),
      };
    });
  }
  private lock(tx: Prisma.TransactionClient, user_id: bigint) {
    return tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`hucescholar:calendar:${user_id}`}, 0))`;
  }
  /** A new or changed link must point at a version the owner can read, within its pages. */
  private async checkSource(tx: Prisma.TransactionClient, fields: Fields) {
    if (fields.version_id === null) return;
    const source = (await this.sources(tx, [fields.version_id])).get(fields.version_id);
    if (!source)
      throw new NotFoundException('Học liệu không còn khả dụng hoặc bạn không có quyền đọc.');
    if (fields.page_number! > source.pageCount) throw invalid('Trang nằm ngoài tài liệu.');
  }

  async range(actor: Profile, query: CalendarRangeDto) {
    const user_id = academicId(actor.id);
    const from = new Date(query.from),
      to = new Date(query.to);
    if (to <= from || to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY)
      throw invalid(`Khoảng xem phải dài từ vài phút tới ${MAX_RANGE_DAYS} ngày.`);
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.calendar_items.findMany({
          where: {
            user_id,
            starts_at: { lt: to },
            OR: [{ ends_at: { gt: from } }, { ends_at: null, starts_at: { gte: from } }],
          },
          orderBy: [{ starts_at: 'asc' }, { id: 'asc' }],
          take: MAX_RANGE_ITEMS + 1,
        });
        return {
          items: await this.serialize(tx, rows.slice(0, MAX_RANGE_ITEMS)),
          truncated: rows.length > MAX_RANGE_ITEMS,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  /** Open tasks: dated ones by due time (overdue first), then those without a date. */
  async tasks(actor: Profile, query: CalendarTasksDto) {
    const user_id = academicId(actor.id);
    const where: Prisma.calendar_itemsWhereInput = {
      user_id,
      kind: 'TASK',
      done_at: query.status === 'open' ? null : { not: null },
    };
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.calendar_items.findMany({
          where,
          orderBy:
            query.status === 'open'
              ? [{ starts_at: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
              : [{ done_at: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        });
        return {
          items: await this.serialize(tx, rows),
          total: await tx.calendar_items.count({ where }),
          page: query.page,
          limit: query.limit,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async create(actor: Profile, body: CreateCalendarItemDto) {
    const user_id = academicId(actor.id);
    const fields = normalize(body);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, user_id);
      const existing = await tx.calendar_items.findUnique({
        where: { user_id_request_id: { user_id, request_id: body.requestId } },
      });
      if (existing) {
        if (!sameFields(existing, fields))
          throw new ConflictException({
            code: 'CALENDAR_REQUEST_REUSED',
            message: 'Yêu cầu tạo mục lịch đã được dùng. Tải lại để đối soát.',
          });
        return { item: (await this.serialize(tx, [existing]))[0] };
      }
      await this.checkSource(tx, fields);
      const row = await tx.calendar_items.create({
        data: { ...fields, user_id, request_id: body.requestId },
      });
      return { item: (await this.serialize(tx, [row]))[0] };
    });
  }
  private async owned(tx: Prisma.TransactionClient, actor: Profile, rawId: string) {
    const user_id = academicId(actor.id);
    await this.lock(tx, user_id);
    const row = await tx.calendar_items.findFirst({ where: { id: academicId(rawId), user_id } });
    if (!row) throw new NotFoundException('Không tìm thấy mục lịch.');
    return row;
  }
  async update(actor: Profile, rawId: string, body: UpdateCalendarItemDto) {
    const fields = normalize(body);
    if (body.keepSource && fields.version_id !== null)
      throw invalid('Giữ liên kết cũ thì không gửi tài liệu mới.');
    return this.db.$transaction(async (tx) => {
      const row = await this.owned(tx, actor, rawId);
      if (row.revision !== body.revision) throw stale();
      if (body.keepSource) {
        fields.version_id = row.version_id;
        fields.page_number = row.page_number;
      }
      // An unchanged link is kept even if the material became unreadable; a new one is checked.
      if (row.version_id !== fields.version_id || row.page_number !== fields.page_number)
        await this.checkSource(tx, fields);
      const updated = await tx.calendar_items.update({
        where: { id: row.id },
        data: {
          ...fields,
          // A task turned into a session stops being a to-do.
          ...(fields.kind === 'EVENT' ? { done_at: null } : {}),
          revision: { increment: 1 },
          updated_at: new Date(),
        },
      });
      return { item: (await this.serialize(tx, [updated]))[0] };
    });
  }
  /** Sets (not toggles) completion; revision is untouched so an open edit form stays valid. */
  async setDone(actor: Profile, rawId: string, body: CalendarDoneDto) {
    return this.db.$transaction(async (tx) => {
      const row = await this.owned(tx, actor, rawId);
      if (row.kind !== 'TASK') throw invalid('Chỉ việc cần làm mới đánh dấu hoàn thành.');
      const updated =
        body.done === (row.done_at !== null)
          ? row
          : await tx.calendar_items.update({
              where: { id: row.id },
              data: { done_at: body.done ? new Date() : null },
            });
      return { item: (await this.serialize(tx, [updated]))[0] };
    });
  }
  async remove(actor: Profile, rawId: string, body: CalendarRevisionDto) {
    await this.db.$transaction(async (tx) => {
      const row = await this.owned(tx, actor, rawId);
      if (row.revision !== body.revision) throw stale();
      await tx.calendar_items.delete({ where: { id: row.id } });
    });
  }
}
