import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUTH_CONFIG, AuthConfiguration } from '../auth/auth.config';
import { Mailer } from '../auth/mailer';
import { DatabaseService } from '../database/database.module';
import { available } from '../library/library.service';
import { dayValue, localDay } from './study-schedule';

/** STUDY-04: the morning notice goes out from this hour, Vietnam time. */
export const STUDY_REMINDER_HOUR = 7;
const BATCH = 1000;
const hourFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  hourCycle: 'h23',
});
/** `studydue:<YYYYMMDD>`: one notice per owner and Vietnam day, whichever worker sends it. */
export const studyReminderKey = (day: string) => `studydue:${day.replace(/-/g, '')}`;

/**
 * Owners who asked for it (BELL, or EMAIL for the bell and a mail) get one notice a day, from
 * STUDY_REMINDER_HOUR, saying how many readable cards are due. Nothing is sent on a day with no
 * due cards, and cards of documents the owner can no longer read are not counted.
 */
export async function dispatchStudyReminders(
  db: DatabaseService,
  mailer: Mailer,
  origin: string,
  now = new Date(),
) {
  if (Number(hourFormat.format(now)) < STUDY_REMINDER_HOUR) return 0;
  const today = localDay(now);
  const key = studyReminderKey(today);
  const owners = await db.users.findMany({
    where: {
      status: 'ACTIVE',
      preferences: { study_reminder: { in: ['BELL', 'EMAIL'] } },
      notifications: { none: { event_key: key } },
    },
    select: {
      id: true,
      email: true,
      display_name: true,
      preferences: { select: { study_reminder: true } },
    },
    orderBy: { id: 'asc' },
    take: BATCH,
  });
  if (!owners.length) return 0;
  const due = await db.study_cards.groupBy({
    by: ['user_id'],
    where: {
      user_id: { in: owners.map((o) => o.id) },
      due_on: { lte: dayValue(today) },
      document_versions: available(),
    },
    _count: { _all: true },
  });
  const counts = new Map(due.map((row) => [row.user_id, row._count._all]));
  let created = 0;
  for (const owner of owners) {
    const cards = counts.get(owner.id);
    if (!cards) continue;
    const { count } = await db.notifications.createMany({
      data: [
        {
          user_id: owner.id,
          kind: 'STUDY_CARDS_DUE',
          event_key: key,
          title: 'Thẻ ôn tập đến hạn',
          detail: String(cards),
        },
      ],
      skipDuplicates: true,
    });
    created += count;
    // Sent at most once: only the worker whose insert won mails; a failure is not retried.
    if (count && owner.preferences?.study_reminder === 'EMAIL' && mailer.enabled)
      await mailer
        .send({
          to: owner.email,
          subject: `Hôm nay có ${cards} thẻ ôn tập đến hạn`,
          text: [
            `Chào ${owner.display_name},`,
            '',
            `Hôm nay bạn có ${cards} thẻ ôn tập đến hạn.`,
            '',
            `Ôn ngay: ${origin}/workspace/study?on=due`,
            '',
            'Bạn nhận thư này vì đã chọn "Chuông và email" cho nhắc thẻ ôn tập. Đổi hoặc tắt trong Cài đặt.',
          ].join('\n'),
        })
        .catch(() => Logger.warn('Study reminder email not sent.', 'StudyReminders'));
  }
  return created;
}

/** The worker's handle on dispatchStudyReminders, with the app's database, mailer and origin. */
@Injectable()
export class StudyReminders {
  constructor(
    private readonly db: DatabaseService,
    private readonly mailer: Mailer,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfiguration,
  ) {}
  dispatch(now = new Date()) {
    return dispatchStudyReminders(this.db, this.mailer, this.config.origin, now);
  }
}
