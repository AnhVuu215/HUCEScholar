BEGIN;
-- A lecturer may give a due date a time of day. Course deadlines are read as Vietnam time
-- (UTC+7, no daylight saving); without a time a due date ends at 23:59 that day.
ALTER TABLE hucescholar.reading_list_items ADD COLUMN due_time time(0)
  CONSTRAINT ck_reading_item_due_time CHECK (due_time IS NULL OR due_on IS NOT NULL);
COMMENT ON COLUMN hucescholar.reading_list_items.due_time IS
  'Giờ hạn đọc (giờ Việt Nam); NULL là hết ngày due_on (23:59). Chỉ có khi có due_on.';

-- A follower chooses how long before each unread due date to be reminded, per course.
ALTER TABLE hucescholar.reading_list_follows ADD COLUMN remind_minutes smallint
  CONSTRAINT ck_follow_remind CHECK (remind_minutes IS NULL OR remind_minutes IN (60, 180, 1440, 2880));
COMMENT ON COLUMN hucescholar.reading_list_follows.remind_minutes IS
  'Nhắc trước hạn đọc chưa đọc bao nhiêu phút; NULL là không nhắc.';

-- Two notices about a listed version: a due date coming up, and a due date the lecturer changed.
-- Both point at the version; event_at is the due time (NULL when a changed due date was removed).
-- Event keys gain a third number: list, version and due time or list revision.
ALTER TABLE hucescholar.notifications
  DROP CONSTRAINT ck_notification_kind,
  ADD CONSTRAINT ck_notification_kind CHECK (kind IN (
    'FILE_SAFE','FILE_FAILED','SOURCE_READY','SOURCE_FAILED',
    'REVIEW_APPROVED','REVIEW_CHANGES_REQUIRED','REVIEW_REJECTED',
    'REPORT_RESOLVED','REPORT_DISMISSED','CALENDAR_REMINDER',
    'READING_DEADLINE_SOON','READING_DEADLINE_CHANGED')),
  DROP CONSTRAINT ck_notification_event,
  ADD CONSTRAINT ck_notification_event CHECK (event_key ~ '^[a-z]+:[1-9][0-9]*(:[1-9][0-9]*){0,2}$'),
  DROP CONSTRAINT ck_notification_target,
  ADD CONSTRAINT ck_notification_target CHECK (
    CASE
      WHEN kind = 'CALENDAR_REMINDER' THEN calendar_item_id IS NOT NULL AND event_at IS NOT NULL
        AND document_id IS NULL AND version_id IS NULL
      WHEN kind = 'READING_DEADLINE_SOON' THEN calendar_item_id IS NULL AND event_at IS NOT NULL
        AND document_id IS NOT NULL AND version_id IS NOT NULL
      WHEN kind = 'READING_DEADLINE_CHANGED' THEN calendar_item_id IS NULL
        AND document_id IS NOT NULL AND version_id IS NOT NULL
      ELSE calendar_item_id IS NULL AND event_at IS NULL
        AND document_id IS NOT NULL AND version_id IS NOT NULL
    END
  );
COMMIT;
