import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AUTH_CONFIG, AuthConfiguration } from '../auth/auth.config';
import { DatabaseService } from '../database/database.module';
import { Prisma, type calendar_items } from '../generated/prisma/client';
import { academicId } from '../academic/academic.service';
import { Profile } from '../auth/auth.types';
import { available } from '../materials/library.service';
import { calendarIcs } from './calendar-ics';
import {
  formatDate,
  isOccurrence,
  lastOfCount,
  localDate,
  maskWeekdays,
  MAX_REPEAT_DAYS,
  occurrenceStarts,
  occurrencesIn,
  parseDate,
  rowSeries,
  seriesProblem,
  weekdayMask,
  type RepeatFreq,
  type Series,
} from './calendar-repeat';
import {
  CalendarDetachDto,
  CalendarExportDto,
  CalendarFieldsDto,
  CalendarOccurrenceDoneDto,
  CalendarOccurrenceDto,
  CalendarRangeDto,
  CalendarRevisionDto,
  CalendarSplitDto,
  CalendarTasksDto,
  CreateCalendarItemDto,
  UpdateCalendarItemDto,
} from './calendar.dto';

const DAY = 86_400_000;
const MAX_RANGE_DAYS = 62;
const MAX_EVENT_DAYS = 14;
const MAX_RANGE_ITEMS = 500;
/** Tasks are sorted in memory, so the task lists read at most this many rows of each kind. */
const MAX_TASK_ROWS = 2000;
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
  let repeat: Series | null = null;
  if (body.repeat) {
    const r = body.repeat;
    if (!startsAt) throw invalid('Chỉ lặp lại mục có ngày.');
    if ((r.until === undefined) === (r.count === undefined))
      throw invalid('Chọn ngày kết thúc lặp hoặc số lần lặp.');
    const base = {
      start: startsAt,
      end: endsAt ?? startsAt,
      days: r.freq === 'WEEKLY' ? weekdayMask(r.weekdays) : 0,
      offset: r.utcOffset,
      freq: r.freq,
      interval: r.interval,
    };
    const until = r.count !== undefined ? lastOfCount(base, r.count) : parseDate(r.until!);
    if (!until)
      throw invalid(
        r.count !== undefined
          ? `${r.count} lần không vừa trong ${MAX_REPEAT_DAYS} ngày sau lần đầu.`
          : 'Ngày kết thúc lặp chưa hợp lệ.',
      );
    repeat = { ...base, until, count: r.count ?? null };
    const problem = seriesProblem(repeat);
    if (problem) throw invalid(problem);
  }
  const remind = body.remindMinutes ?? null;
  if (remind !== null && (!startsAt || body.allDay))
    throw invalid('Chỉ nhắc được mục có ngày và giờ, không phải cả ngày.');
  if (body.remindEmail && remind === null) throw invalid('Chọn giờ nhắc trước khi bật email.');
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
    repeat_freq: repeat?.freq ?? null,
    repeat_days: repeat && repeat.freq === 'WEEKLY' ? repeat.days : null,
    repeat_until: repeat?.until ?? null,
    repeat_utc_offset: repeat?.offset ?? null,
    repeat_interval: repeat?.interval ?? null,
    repeat_count: repeat?.count ?? null,
    remind_minutes: remind,
    remind_email: body.remindEmail,
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
  row.page_number === fields.page_number &&
  row.remind_minutes === fields.remind_minutes &&
  row.remind_email === fields.remind_email &&
  sameRepeat(row, fields);
const sameRepeat = (row: calendar_items, fields: Fields) =>
  row.repeat_freq === fields.repeat_freq &&
  row.repeat_days === fields.repeat_days &&
  row.repeat_until?.getTime() === fields.repeat_until?.getTime() &&
  row.repeat_utc_offset === fields.repeat_utc_offset &&
  row.repeat_interval === fields.repeat_interval &&
  row.repeat_count === fields.repeat_count;
/** Skips name original start times, so they no longer match once the timing changes. */
const sameTiming = (row: calendar_items, fields: Fields) =>
  row.starts_at?.getTime() === fields.starts_at?.getTime() &&
  row.ends_at?.getTime() === fields.ends_at?.getTime() &&
  sameRepeat(row, fields);
const series = (row: calendar_items) => rowSeries(row);

/**
 * CAL-01/02/03. A private calendar: only the owner reads or writes. Linked material is shown only while
 * the owner can read that version; otherwise the item stays but the link is withheld.
 */
@Injectable()
export class CalendarService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfiguration,
  ) {}

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
        repeat:
          r.repeat_freq !== null && r.repeat_until
            ? {
                freq: r.repeat_freq as RepeatFreq,
                interval: r.repeat_interval ?? 1,
                count: r.repeat_count,
                weekdays: r.repeat_days === null ? [] : maskWeekdays(r.repeat_days),
                until: formatDate(r.repeat_until),
                startsAt: r.starts_at!.toISOString(),
                endsAt: r.ends_at?.toISOString() ?? null,
              }
            : null,
        reminder:
          r.remind_minutes === null ? null : { minutes: r.remind_minutes, email: r.remind_email },
        /** Original start of this occurrence of a series; null for a single item. */
        occurrenceStart: null as string | null,
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
        const single = await tx.calendar_items.findMany({
          where: {
            user_id,
            repeat_freq: null,
            starts_at: { lt: to },
            OR: [{ ends_at: { gt: from } }, { ends_at: null, starts_at: { gte: from } }],
          },
          orderBy: [{ starts_at: 'asc' }, { id: 'asc' }],
          take: MAX_RANGE_ITEMS + 1,
        });
        // A series can still reach the window when its last date is up to one event length
        // (≤ 14 days) plus a day of UTC offset before it.
        const repeating = await tx.calendar_items.findMany({
          where: {
            user_id,
            repeat_freq: { not: null },
            starts_at: { lt: to },
            repeat_until: { gte: new Date(from.getTime() - (MAX_EVENT_DAYS + 1) * DAY) },
          },
          include: {
            calendar_item_skips: { select: { occurrence_start: true } },
            calendar_item_done: { select: { occurrence_start: true } },
          },
        });
        const done = new Set(
          repeating.flatMap((row) =>
            row.calendar_item_done.map((d) => `${row.id}@${d.occurrence_start.getTime()}`),
          ),
        );
        const occurrences = repeating.flatMap((row) =>
          occurrencesIn(
            series(row)!,
            from,
            to,
            new Set(row.calendar_item_skips.map((s) => s.occurrence_start.getTime())),
          ).map((o) => ({ id: String(row.id), ...o })),
        );
        const plain = await this.serialize(tx, single);
        const byId = new Map((await this.serialize(tx, repeating)).map((item) => [item.id, item]));
        const items = [
          ...plain,
          ...occurrences.map(({ id, start, end }) => {
            const base = byId.get(id)!;
            return {
              ...base,
              startsAt: start.toISOString(),
              endsAt: base.kind === 'TASK' ? null : end.toISOString(),
              occurrenceStart: start.toISOString(),
              done: base.kind === 'TASK' && done.has(`${id}@${start.getTime()}`),
            };
          }),
        ].sort(
          (a, b) =>
            Date.parse(a.startsAt!) - Date.parse(b.startsAt!) ||
            Number(BigInt(a.id) - BigInt(b.id)),
        );
        return {
          items: items.slice(0, MAX_RANGE_ITEMS),
          truncated: items.length > MAX_RANGE_ITEMS,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  /**
   * CAL-05. Every session (series as one weekly rule) and every open task with a due date, as an
   * iCalendar file. Undated and done tasks are left out; notes and linked pages only on request.
   */
  async exportIcs(actor: Profile, query: CalendarExportDto) {
    const user_id = academicId(actor.id);
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.calendar_items.findMany({
          where: {
            user_id,
            starts_at: { not: null },
            OR: [{ kind: 'EVENT' }, { kind: 'TASK', done_at: null }],
          },
          include: {
            calendar_item_skips: { select: { occurrence_start: true } },
            calendar_item_done: { select: { occurrence_start: true } },
          },
          orderBy: [{ starts_at: 'asc' }, { id: 'asc' }],
        });
        const items = await this.serialize(tx, rows);
        return calendarIcs(
          rows.map((row, index) => {
            const { material } = items[index];
            return {
              id: String(row.id),
              kind: row.kind as 'EVENT' | 'TASK',
              title: row.title,
              details: row.details,
              start: row.starts_at!,
              end: row.ends_at,
              allDay: row.all_day,
              series: series(row),
              // A done occurrence of a repeating task is no longer a to-do.
              skipped: [...row.calendar_item_skips, ...row.calendar_item_done].map((s) =>
                s.occurrence_start.getTime(),
              ),
              remindMinutes: row.remind_minutes,
              material: material && {
                title: material.title,
                pageNumber: material.pageNumber,
                href: `/workspace/library/versions/${material.versionId}?page=${material.pageNumber}`,
              },
            };
          }),
          { offset: query.utcOffset, details: query.details, now: new Date() },
          this.config.origin,
        );
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  /**
   * Open tasks: dated ones by due time (overdue first), then those without a date. A repeating
   * task is listed once, at its earliest occurrence that is neither done nor removed. Done
   * tasks: newest first, each done occurrence of a repeating task as its own row.
   */
  async tasks(actor: Profile, query: CalendarTasksDto) {
    const user_id = academicId(actor.id);
    return this.db.$transaction(
      async (tx) => {
        const single = await tx.calendar_items.findMany({
          where: {
            user_id,
            kind: 'TASK',
            repeat_freq: null,
            done_at: query.status === 'open' ? null : { not: null },
          },
          take: MAX_TASK_ROWS,
        });
        const repeating = await tx.calendar_items.findMany({
          where: { user_id, kind: 'TASK', repeat_freq: { not: null } },
          include: {
            calendar_item_skips: { select: { occurrence_start: true } },
            calendar_item_done: { select: { occurrence_start: true, done_at: true } },
          },
          take: MAX_TASK_ROWS,
        });
        const byId = new Map(
          (await this.serialize(tx, [...single, ...repeating])).map((i) => [i.id, i]),
        );
        type Row = ReturnType<typeof byId.get> & object;
        const rows: { item: Row; sort: number; id: bigint }[] = [];
        if (query.status === 'open') {
          for (const row of single)
            rows.push({
              item: byId.get(String(row.id))!,
              sort: row.starts_at?.getTime() ?? Number.MAX_SAFE_INTEGER,
              id: row.id,
            });
          for (const row of repeating) {
            const gone = new Set([
              ...row.calendar_item_skips.map((s) => s.occurrence_start.getTime()),
              ...row.calendar_item_done.map((d) => d.occurrence_start.getTime()),
            ]);
            for (const start of occurrenceStarts(series(row)!)) {
              if (gone.has(start)) continue;
              const at = new Date(start).toISOString();
              rows.push({
                item: { ...byId.get(String(row.id))!, startsAt: at, occurrenceStart: at },
                sort: start,
                id: row.id,
              });
              break;
            }
          }
          rows.sort((a, b) => a.sort - b.sort || Number(a.id - b.id));
        } else {
          for (const row of single)
            rows.push({
              item: byId.get(String(row.id))!,
              sort: -row.done_at!.getTime(),
              id: -row.id,
            });
          for (const row of repeating)
            for (const d of row.calendar_item_done) {
              const at = d.occurrence_start.toISOString();
              rows.push({
                item: {
                  ...byId.get(String(row.id))!,
                  startsAt: at,
                  occurrenceStart: at,
                  done: true,
                },
                sort: -d.done_at.getTime(),
                id: -row.id,
              });
            }
          rows.sort((a, b) => a.sort - b.sort || Number(a.id - b.id));
        }
        const start = (query.page - 1) * query.limit;
        return {
          items: rows.slice(start, start + query.limit).map((r) => r.item),
          total: rows.length,
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
      if (!sameTiming(row, fields)) {
        await tx.calendar_item_skips.deleteMany({ where: { item_id: row.id } });
        await tx.calendar_item_done.deleteMany({ where: { item_id: row.id } });
      }
      const updated = await tx.calendar_items.update({
        where: { id: row.id },
        data: {
          ...fields,
          // A task turned into a session stops being a to-do; a series is done per occurrence.
          ...(fields.kind === 'EVENT' || fields.repeat_freq ? { done_at: null } : {}),
          revision: { increment: 1 },
          updated_at: new Date(),
        },
      });
      return { item: (await this.serialize(tx, [updated]))[0] };
    });
  }
  /**
   * Sets (not toggles) completion; revision is untouched so an open edit form stays valid. A
   * repeating task is done one occurrence at a time.
   */
  async setDone(actor: Profile, rawId: string, body: CalendarOccurrenceDoneDto) {
    return this.db.$transaction(async (tx) => {
      const row = await this.owned(tx, actor, rawId);
      if (row.kind !== 'TASK') throw invalid('Chỉ việc cần làm mới đánh dấu hoàn thành.');
      if (row.repeat_freq) {
        if (!body.occurrenceStart) throw invalid('Chọn lần nào của việc lặp lại đã xong.');
        const { at, skipped } = await this.occurrence(tx, row, body.occurrenceStart);
        if (skipped) throw stale();
        const key = { item_id_occurrence_start: { item_id: row.id, occurrence_start: at } };
        if (body.done)
          await tx.calendar_item_done.upsert({
            where: key,
            create: { item_id: row.id, occurrence_start: at },
            update: {},
          });
        else
          await tx.calendar_item_done.deleteMany({
            where: { item_id: row.id, occurrence_start: at },
          });
        const [item] = await this.serialize(tx, [row]);
        const iso = at.toISOString();
        return { item: { ...item, startsAt: iso, occurrenceStart: iso, done: body.done } };
      }
      if (body.occurrenceStart) throw invalid('Việc này không lặp lại.');
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
  /** A real occurrence of an owned series, and whether it was already skipped. */
  private async occurrence(
    tx: Prisma.TransactionClient,
    row: calendar_items,
    occurrenceStart: string,
  ) {
    const plan = series(row);
    const at = new Date(occurrenceStart);
    if (!plan) throw invalid('Mục lịch này không lặp lại.');
    if (!isOccurrence(plan, at)) throw invalid('Chuỗi lịch không có buổi này.');
    const skipped = await tx.calendar_item_skips.findUnique({
      where: { item_id_occurrence_start: { item_id: row.id, occurrence_start: at } },
    });
    return { at, skipped: skipped !== null };
  }
  private async addSkip(tx: Prisma.TransactionClient, row: calendar_items, at: Date) {
    await tx.calendar_item_skips.create({ data: { item_id: row.id, occurrence_start: at } });
    await tx.calendar_items.update({
      where: { id: row.id },
      data: { revision: { increment: 1 }, updated_at: new Date() },
    });
  }
  /** "Xóa buổi này". Skipping an occurrence that is already skipped changes nothing. */
  async skip(actor: Profile, rawId: string, body: CalendarOccurrenceDto) {
    await this.db.$transaction(async (tx) => {
      const row = await this.owned(tx, actor, rawId);
      const { at, skipped } = await this.occurrence(tx, row, body.occurrenceStart);
      if (skipped) return;
      if (row.revision !== body.revision) throw stale();
      await this.addSkip(tx, row, at);
    });
  }
  /** "Chỉ buổi này": skip the occurrence and create a single item in one transaction. */
  async detach(actor: Profile, rawId: string, body: CalendarDetachDto) {
    const fields = normalize(body);
    if (fields.repeat_freq !== null) throw invalid('Buổi tách ra không lặp lại.');
    if (body.keepSource && fields.version_id !== null)
      throw invalid('Giữ liên kết cũ thì không gửi tài liệu mới.');
    return this.db.$transaction(async (tx) => {
      const row = await this.owned(tx, actor, rawId);
      if (body.keepSource) {
        fields.version_id = row.version_id;
        fields.page_number = row.page_number;
      }
      // A retried detach returns the item the first attempt made.
      const existing = await tx.calendar_items.findUnique({
        where: { user_id_request_id: { user_id: row.user_id, request_id: body.requestId } },
      });
      if (existing) {
        if (!sameFields(existing, fields))
          throw new ConflictException({
            code: 'CALENDAR_REQUEST_REUSED',
            message: 'Yêu cầu tạo mục lịch đã được dùng. Tải lại để đối soát.',
          });
        return { item: (await this.serialize(tx, [existing]))[0] };
      }
      if (row.revision !== body.revision) throw stale();
      const { at, skipped } = await this.occurrence(tx, row, body.occurrenceStart);
      if (skipped) throw stale();
      // The series' own link is kept even if it became unreadable; a new one is checked.
      if (row.version_id !== fields.version_id || row.page_number !== fields.page_number)
        await this.checkSource(tx, fields);
      await this.addSkip(tx, row, at);
      const created = await tx.calendar_items.create({
        data: { ...fields, user_id: row.user_id, request_id: body.requestId },
      });
      return { item: (await this.serialize(tx, [created]))[0] };
    });
  }
  /** The local day before an occurrence, as the new last date of the series it leaves. */
  private dayBefore(row: calendar_items, at: Date) {
    return new Date(localDate(at, row.repeat_utc_offset ?? 0) - DAY);
  }
  /** Ends the series before `at`; the occurrences from there on, and their marks, go away. */
  private async endBefore(tx: Prisma.TransactionClient, row: calendar_items, at: Date) {
    await tx.calendar_item_skips.deleteMany({
      where: { item_id: row.id, occurrence_start: { gte: at } },
    });
    await tx.calendar_item_done.deleteMany({
      where: { item_id: row.id, occurrence_start: { gte: at } },
    });
    await tx.calendar_items.update({
      where: { id: row.id },
      data: {
        repeat_until: this.dayBefore(row, at),
        // The date now ends the series; a count would no longer match it.
        repeat_count: null,
        revision: { increment: 1 },
        updated_at: new Date(),
      },
    });
  }
  /**
   * CAL-07 "Buổi này và các buổi sau": the series ends before this occurrence and a new item with
   * the given fields starts at it. From the first occurrence it is the same as editing the series.
   */
  async split(actor: Profile, rawId: string, body: CalendarSplitDto) {
    const fields = normalize(body);
    if (body.keepSource && fields.version_id !== null)
      throw invalid('Giữ liên kết cũ thì không gửi tài liệu mới.');
    return this.db.$transaction(async (tx) => {
      const row = await this.owned(tx, actor, rawId);
      if (body.keepSource) {
        fields.version_id = row.version_id;
        fields.page_number = row.page_number;
      }
      const existing = await tx.calendar_items.findUnique({
        where: { user_id_request_id: { user_id: row.user_id, request_id: body.requestId } },
      });
      if (existing) {
        if (!sameFields(existing, fields))
          throw new ConflictException({
            code: 'CALENDAR_REQUEST_REUSED',
            message: 'Yêu cầu tạo mục lịch đã được dùng. Tải lại để đối soát.',
          });
        return { item: (await this.serialize(tx, [existing]))[0] };
      }
      if (row.revision !== body.revision) throw stale();
      const { at, skipped } = await this.occurrence(tx, row, body.occurrenceStart);
      if (skipped) throw stale();
      if (at.getTime() === row.starts_at!.getTime())
        throw invalid('Từ buổi đầu tiên thì sửa cả chuỗi.');
      if (row.version_id !== fields.version_id || row.page_number !== fields.page_number)
        await this.checkSource(tx, fields);
      await this.endBefore(tx, row, at);
      const created = await tx.calendar_items.create({
        data: { ...fields, user_id: row.user_id, request_id: body.requestId },
      });
      return { item: (await this.serialize(tx, [created]))[0] };
    });
  }
  /** CAL-07 "Xóa buổi này và các buổi sau"; from the first occurrence it deletes the series. */
  async truncate(actor: Profile, rawId: string, body: CalendarOccurrenceDto) {
    await this.db.$transaction(async (tx) => {
      const row = await this.owned(tx, actor, rawId);
      if (row.revision !== body.revision) throw stale();
      const { at } = await this.occurrence(tx, row, body.occurrenceStart);
      if (at.getTime() === row.starts_at!.getTime())
        await tx.calendar_items.delete({ where: { id: row.id } });
      else await this.endBefore(tx, row, at);
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
