import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { academicId } from '../academic/academic.service';
import { Profile } from '../auth/auth.types';
import { NotificationListDto } from './notifications.dto';

const select = {
  id: true,
  kind: true,
  document_id: true,
  version_id: true,
  title: true,
  detail: true,
  created_at: true,
  read_at: true,
  calendar_item_id: true,
  event_at: true,
} as const;

/** Every query filters by the session user: a notice is never readable by anyone else. */
@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}
  async list(actor: Profile, query: NotificationListDto) {
    const user_id = academicId(actor.id);
    const where = { user_id, ...(query.filter === 'unread' ? { read_at: null } : {}) };
    const [rows, total, unread] = await this.db.$transaction(
      [
        this.db.notifications.findMany({
          where,
          select,
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.db.notifications.count({ where }),
        this.db.notifications.count({ where: { user_id, read_at: null } }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: rows.map((n) => ({
        id: String(n.id),
        kind: n.kind,
        documentId: n.document_id === null ? null : String(n.document_id),
        versionId: n.version_id === null ? null : String(n.version_id),
        /** CALENDAR_REMINDER: the item and the start (or due time) it is about. */
        calendarItemId: n.calendar_item_id === null ? null : String(n.calendar_item_id),
        eventAt: n.event_at?.toISOString() ?? null,
        title: n.title,
        detail: n.detail,
        createdAt: n.created_at.toISOString(),
        read: n.read_at !== null,
      })),
      total,
      unread,
      page: query.page,
      limit: query.limit,
    };
  }
  async unread(actor: Profile) {
    return {
      unread: await this.db.notifications.count({
        where: { user_id: academicId(actor.id), read_at: null },
      }),
    };
  }
  async read(actor: Profile, rawId: string) {
    const user_id = academicId(actor.id);
    const id = academicId(rawId);
    // Marking twice is harmless; a notice owned by someone else is indistinguishable from none.
    const exists = await this.db.notifications.count({ where: { id, user_id } });
    if (!exists) throw new NotFoundException('Không tìm thấy thông báo.');
    await this.db.notifications.updateMany({
      where: { id, user_id, read_at: null },
      data: { read_at: new Date() },
    });
    return this.unread(actor);
  }
  async readAll(actor: Profile) {
    await this.db.notifications.updateMany({
      where: { user_id: academicId(actor.id), read_at: null },
      data: { read_at: new Date() },
    });
    return { unread: 0 };
  }
}
