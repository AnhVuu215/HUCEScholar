BEGIN;
-- CAL-03: one reminder per timed session or dated task, minutes before it starts (0 = at the
-- start). The file worker turns due reminders into in-app notices, plus an email when asked.
ALTER TABLE hucescholar.calendar_items
  ADD COLUMN remind_minutes smallint,
  ADD COLUMN remind_email boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT ck_calendar_remind CHECK (
    remind_minutes IS NULL OR (
      remind_minutes IN (0, 5, 10, 15, 30, 60, 120, 1440)
      AND starts_at IS NOT NULL AND NOT all_day
    )
  ),
  ADD CONSTRAINT ck_calendar_remind_email CHECK (NOT remind_email OR remind_minutes IS NOT NULL);
-- The worker scans every owner at once: single items by start, series by their last date.
CREATE INDEX ix_calendar_remind_single ON hucescholar.calendar_items(starts_at)
  WHERE remind_minutes IS NOT NULL AND repeat_days IS NULL AND done_at IS NULL;
CREATE INDEX ix_calendar_remind_series ON hucescholar.calendar_items(repeat_until)
  WHERE remind_minutes IS NOT NULL AND repeat_days IS NOT NULL;
COMMENT ON COLUMN hucescholar.calendar_items.remind_minutes IS
  'Nhắc trước bao nhiêu phút (0 = lúc bắt đầu); NULL là không nhắc. Chỉ cho mục có giờ.';
COMMENT ON COLUMN hucescholar.calendar_items.remind_email IS
  'Gửi thêm email tới địa chỉ của chủ khi nhắc (nếu máy chủ có cấu hình mail).';

-- A reminder points at the calendar item and the occurrence it is about, not at a document.
ALTER TABLE hucescholar.notifications
  DROP CONSTRAINT ck_notification_kind,
  ADD CONSTRAINT ck_notification_kind CHECK (kind IN (
    'FILE_SAFE','FILE_FAILED','SOURCE_READY','SOURCE_FAILED',
    'REVIEW_APPROVED','REVIEW_CHANGES_REQUIRED','REVIEW_REJECTED',
    'REPORT_RESOLVED','REPORT_DISMISSED','CALENDAR_REMINDER')),
  ALTER COLUMN document_id DROP NOT NULL,
  ALTER COLUMN version_id DROP NOT NULL,
  ADD COLUMN calendar_item_id bigint REFERENCES hucescholar.calendar_items(id) ON DELETE CASCADE,
  ADD COLUMN event_at timestamptz,
  ADD CONSTRAINT ck_notification_target CHECK (
    CASE WHEN kind = 'CALENDAR_REMINDER'
      THEN calendar_item_id IS NOT NULL AND event_at IS NOT NULL
        AND document_id IS NULL AND version_id IS NULL
      ELSE calendar_item_id IS NULL AND event_at IS NULL
        AND document_id IS NOT NULL AND version_id IS NOT NULL
    END
  );
CREATE INDEX ix_notification_calendar ON hucescholar.notifications(calendar_item_id);
COMMENT ON COLUMN hucescholar.notifications.calendar_item_id IS
  'CALENDAR_REMINDER: mục lịch được nhắc; xóa mục thì xóa luôn lời nhắc.';
COMMENT ON COLUMN hucescholar.notifications.event_at IS
  'CALENDAR_REMINDER: giờ bắt đầu (hoặc hạn) của buổi được nhắc.';
COMMIT;
