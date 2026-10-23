import { Inject, Injectable, Logger, Module } from '@nestjs/common';
import { AUTH_CONFIG, AuthConfiguration } from '../auth/auth.config';
import { Mailer } from '../auth/mailer';
import { DatabaseService } from '../database/database.module';
import { DAY, occurrenceStarts, type Series } from './calendar-repeat';

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
function leadLabel(minutes: number) {
  if (minutes === 0) return 'bây giờ';
  if (minutes === 1440) return 'sau 1 ngày';
  return minutes >= 60 ? `sau ${minutes / 60} giờ` : `sau ${minutes} phút`;
}

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
      users: { select: { email: true, display_name: true, status: true } },
      calendar_item_skips: { select: { occurrence_start: true } },
    } as const;
    const single = await this.db.calendar_items.findMany({
      where: {
        remind_minutes: { not: null },
        repeat_days: null,
        done_at: null,
        starts_at: { gt: new Date(from), lte: new Date(to + MAX_LEAD_MS) },
      },
      include,
      orderBy: { starts_at: 'asc' },
      take: BATCH,
    });
    // A series' last date is local to its owner; two days covers any UTC offset.
    const repeating = await this.db.calendar_items.findMany({
      where: {
        remind_minutes: { not: null },
        repeat_days: { not: null },
        starts_at: { lte: new Date(to + MAX_LEAD_MS) },
        repeat_until: { gte: new Date(from - 2 * DAY) },
      },
      include,
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    let created = 0;
    for (const row of [...single, ...repeating]) {
      const plan: Series | null =
        row.repeat_days !== null && row.repeat_until && row.ends_at
          ? {
              start: row.starts_at!,
              end: row.ends_at,
              days: row.repeat_days,
              until: row.repeat_until,
              offset: row.repeat_utc_offset ?? 0,
            }
          : null;
      const skipped = new Set(row.calendar_item_skips.map((s) => s.occurrence_start.getTime()));
      const starts = dueStarts(
        { start: row.starts_at!, minutes: row.remind_minutes!, series: plan, skipped },
        from,
        to,
      );
      for (const start of starts) {
        const { count } = await this.db.notifications.createMany({
          data: [
            {
              user_id: row.user_id,
              kind: 'CALENDAR_REMINDER',
              event_key: reminderKey(row.id, start),
              calendar_item_id: row.id,
              event_at: new Date(start),
              title: row.title,
              detail: row.kind,
            },
          ],
          skipDuplicates: true,
        });
        created += count;
        // Sent at most once: only the worker whose insert won mails, and a failure is not retried.
        if (count && row.remind_email && this.mailer.enabled && row.users.status === 'ACTIVE')
          await this.mail(row, start).catch(() =>
            Logger.warn('Calendar reminder email not sent.', 'CalendarReminders'),
          );
      }
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
      remind_minutes: number | null;
      users: { email: string; display_name: string };
    },
    start: number,
  ) {
    const what =
      row.kind === 'TASK' ? `Việc “${row.title}” đến hạn` : `Buổi học “${row.title}” bắt đầu`;
    return this.mailer.send({
      to: row.users.email,
      subject: `Nhắc lịch: ${row.title}`,
      text: [
        `Chào ${row.users.display_name},`,
        '',
        `${what} ${leadLabel(row.remind_minutes ?? 0)}.`,
        '',
        `Xem lịch: ${this.config.origin}/workspace/calendar?at=${new Date(start).toISOString()}`,
        '',
        'Bạn nhận thư này vì đã bật "Gửi cả email" cho mục lịch. Tắt trong form sửa mục lịch.',
      ].join('\n'),
    });
  }
}

@Module({ providers: [CalendarReminders, Mailer], exports: [CalendarReminders] })
export class CalendarRemindersModule {}
