import { Inject, Injectable, Logger, Module } from '@nestjs/common';
import { AUTH_CONFIG, AuthConfiguration } from '../auth/auth.config';
import { Mailer } from '../auth/mailer';
import { DatabaseService } from '../database/database.module';
import { DAY, occurrenceStarts, rowSeries, type Series } from './calendar-repeat';
import { available } from '../materials/library.service';
import { notify } from '../notifications/notify';
import { dueInstant, shown } from '../reading-lists/reading-lists.service';

/**
 * CAL-03. A reminder is due once `start - minutes` has passed. The worker looks back this far, so a
 * short outage or a slow tick still delivers; anything older is dropped rather than sent late.
 */
export const REMINDER_GRACE_MS = 10 * 60_000;
const MAX_LEAD_MS = 1440 * 60_000;
const BATCH = 1000;

/** Starts (ms) of the item's occurrences whose reminder falls in (from, to], in order. */
export function dueStarts(
  item: { start: Date; minutes: number; series: Series | null; skipped: Set<number> },
  from: number,
  to: number,
) {
  const lead = item.minutes * 60_000;
  const starts = item.series ? occurrenceStarts(item.series) : [item.start.getTime()];
  const due: number[] = [];
  for (const start of starts) {
    if (start - lead > to) break;
    if (start - lead > from && !item.skipped.has(start)) due.push(start);
  }
  return due;
}
/** `reminder:<item>:<start in seconds>`: one notice per occurrence, whichever worker sends it. */
export const reminderKey = (itemId: bigint, start: number) =>
  `reminder:${itemId}:${Math.floor(start / 1000)}`;
function leadLabel(minutes: number, allDay: boolean) {
  if (allDay) return minutes < 0 ? 'hôm nay' : 'ngày mai';
  if (minutes === 0) return 'bây giờ';
  if (minutes === 1440) return 'sau 1 ngày';
  return minutes >= 60 ? `sau ${minutes / 60} giờ` : `sau ${minutes} phút`;
}
/**
 * The first lead keeps the CAL-03 key, so notices already sent stay unique; extra leads add the
 * lead itself, shifted to be positive (all-day leads go down to -480).
 */
const leadKey = (itemId: bigint, start: number, lead: number, first: boolean) =>
  first ? reminderKey(itemId, start) : `${reminderKey(itemId, start)}:${lead + 1441}`;
/** All-day reminders may come up to eight hours after the item's start (08:00 that day). */
const MAX_LATE_MS = 480 * 60_000;

@Injectable()
export class CalendarReminders {
  constructor(
    private readonly db: DatabaseService,
    private readonly mailer: Mailer,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfiguration,
  ) {}

  /** Records every reminder due by `now`; returns how many notices were new. */
  async dispatch(now = new Date()) {
    const from = now.getTime() - REMINDER_GRACE_MS,
      to = now.getTime();
    const include = {
      users: {
        select: {
          email: true,
          display_name: true,
          status: true,
          preferences: { select: { reminder_email: true } },
        },
      },
      calendar_item_skips: { select: { occurrence_start: true } },
      calendar_item_done: { select: { occurrence_start: true } },
    } as const;
    const single = await this.db.calendar_items.findMany({
      where: {
        remind_minutes: { not: null },
        repeat_freq: null,
        done_at: null,
        starts_at: { gt: new Date(from - MAX_LATE_MS), lte: new Date(to + MAX_LEAD_MS) },
      },
      include,
      orderBy: { starts_at: 'asc' },
      take: BATCH,
    });
    // A series' last date is local to its owner; two days covers any UTC offset.
    const repeating = await this.db.calendar_items.findMany({
      where: {
        remind_minutes: { not: null },
        repeat_freq: { not: null },
        starts_at: { lte: new Date(to + MAX_LEAD_MS) },
        repeat_until: { gte: new Date(from - 2 * DAY) },
      },
      include,
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    let created = 0;
    for (const row of [...single, ...repeating]) {
      const plan = rowSeries(row);
      // Removed occurrences, and those of a repeating task already done, are not reminded.
      const skipped = new Set(
        [...row.calendar_item_skips, ...row.calendar_item_done].map((s) =>
          s.occurrence_start.getTime(),
        ),
      );
      // The owner may turn reminder emails off for the whole account (CAL-07).
      const email =
        row.remind_email &&
        this.mailer.enabled &&
        row.users.status === 'ACTIVE' &&
        (row.users.preferences?.reminder_email ?? true);
      for (const [index, lead] of [row.remind_minutes!, ...row.remind_more].entries()) {
        const starts = dueStarts(
          { start: row.starts_at!, minutes: lead, series: plan, skipped },
          from,
          to,
        );
        for (const start of starts) {
          const { count } = await this.db.notifications.createMany({
            data: [
              {
                user_id: row.user_id,
                kind: 'CALENDAR_REMINDER',
                event_key: leadKey(row.id, start, lead, index === 0),
                calendar_item_id: row.id,
                event_at: new Date(start),
                title: row.title,
                detail: row.kind,
              },
            ],
            skipDuplicates: true,
          });
          created += count;
          // Sent at most once: only the worker whose insert won mails; a failure is not retried.
          if (count && email)
            await this.mail(row, start, lead).catch(() =>
              Logger.warn('Calendar reminder email not sent.', 'CalendarReminders'),
            );
        }
      }
    }
    return created + (await this.deadlines(from, to));
  }
  /**
   * Reading-list due dates the follower has not marked read, `remind_minutes` before each one
   * ends, on the lists that follower can see. In-app only; one notice per course, version and
   * due time, so a version listed twice in a course is reminded once.
   */
  private async deadlines(from: number, to: number) {
    const follows = await this.db.reading_list_follows.findMany({
      where: {
        remind_minutes: { not: null },
        users: { status: 'ACTIVE' },
        courses: { is_active: true, faculties: { is_active: true } },
      },
      select: { user_id: true, course_id: true, remind_minutes: true },
      take: BATCH,
    });
    if (!follows.length) return 0;
    const courses = [...new Set(follows.map((f) => f.course_id))];
    // The longest lead is two days and a due date ends within its own day (Vietnam time).
    const day = (ms: number) => new Date(Math.floor(ms / DAY) * DAY);
    const items = await this.db.reading_list_items.findMany({
      where: {
        due_on: { gte: day(from - DAY), lte: day(to + 3 * DAY) },
        document_versions: available(),
        reading_lists: { OR: courses.map((id) => ({ course_id: id, ...shown(id) })) },
      },
      select: {
        version_id: true,
        due_on: true,
        due_time: true,
        reading_lists: { select: { course_id: true } },
      },
    });
    if (!items.length) return 0;
    const marks = new Set(
      (
        await this.db.reading_marks.findMany({
          where: {
            user_id: { in: [...new Set(follows.map((f) => f.user_id))] },
            version_id: { in: [...new Set(items.map((i) => i.version_id))] },
          },
          select: { user_id: true, version_id: true },
        })
      ).map((m) => `${m.user_id}:${m.version_id}`),
    );
    let created = 0;
    for (const follow of follows)
      for (const item of items) {
        if (item.reading_lists.course_id !== follow.course_id) continue;
        if (marks.has(`${follow.user_id}:${item.version_id}`)) continue;
        const due = dueInstant(item.due_on!, item.due_time).getTime();
        const at = due - follow.remind_minutes! * 60_000;
        if (at <= from || at > to) continue;
        created += await notify(this.db, {
          userId: follow.user_id,
          kind: 'READING_DEADLINE_SOON',
          eventKey: `deadline:${follow.course_id}:${item.version_id}:${Math.floor(due / 1000)}`,
          versionId: item.version_id,
          eventAt: new Date(due),
        });
      }
    return created;
  }
  /**
   * Relative wording, and a link the browser places on a local day: the server does not know the
   * owner's time zone for a single item.
   */
  private mail(
    row: {
      kind: string;
      title: string;
      all_day: boolean;
      users: { email: string; display_name: string };
    },
    start: number,
    lead: number,
  ) {
    const what =
      row.kind === 'TASK' ? `Việc “${row.title}” đến hạn` : `Buổi học “${row.title}” bắt đầu`;
    return this.mailer.send({
      to: row.users.email,
      subject: `Nhắc lịch: ${row.title}`,
      text: [
        `Chào ${row.users.display_name},`,
        '',
        `${what} ${leadLabel(lead, row.all_day)}.`,
        '',
        `Xem lịch: ${this.config.origin}/workspace/calendar?at=${new Date(start).toISOString()}`,
        '',
        'Bạn nhận thư này vì đã bật "Gửi cả email" cho mục lịch. Tắt trong form sửa mục lịch, hoặc tắt mọi email nhắc lịch trong Cài đặt.',
      ].join('\n'),
    });
  }
}

@Module({ providers: [CalendarReminders, Mailer], exports: [CalendarReminders] })
export class CalendarRemindersModule {}
