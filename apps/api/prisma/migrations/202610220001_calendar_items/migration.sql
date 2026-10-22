BEGIN;
-- CAL-01: private study calendar. EVENT = timed or all-day study session; TASK = to-do with an
-- optional due time. Items may point at a document version/page the owner could read when saved.
CREATE TABLE hucescholar.calendar_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL,
  user_id bigint NOT NULL REFERENCES hucescholar.users(id) ON DELETE CASCADE,
  kind varchar(8) NOT NULL CONSTRAINT ck_calendar_kind CHECK (kind IN ('EVENT', 'TASK')),
  title varchar(200) NOT NULL CONSTRAINT ck_calendar_title CHECK (btrim(title) <> ''),
  details varchar(2000) NOT NULL DEFAULT '',
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  color varchar(8) NOT NULL DEFAULT 'blue'
    CONSTRAINT ck_calendar_color CHECK (color IN ('blue', 'green', 'orange', 'purple', 'red', 'gray')),
  version_id bigint REFERENCES hucescholar.document_versions(id) ON DELETE RESTRICT,
  page_number integer,
  revision integer NOT NULL DEFAULT 1
    CONSTRAINT ck_calendar_revision CHECK (revision BETWEEN 1 AND 2147483646),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_calendar_request UNIQUE (user_id, request_id),
  CONSTRAINT ck_calendar_event_time CHECK (
    kind <> 'EVENT' OR (
      starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at
      AND ends_at - starts_at <= interval '14 days'
    )
  ),
  CONSTRAINT ck_calendar_task_shape CHECK (
    kind <> 'TASK' OR (ends_at IS NULL AND (starts_at IS NOT NULL OR NOT all_day))
  ),
  CONSTRAINT ck_calendar_done_task CHECK (done_at IS NULL OR kind = 'TASK'),
  CONSTRAINT ck_calendar_source CHECK (
    (version_id IS NULL AND page_number IS NULL)
    OR (version_id IS NOT NULL AND page_number IS NOT NULL AND page_number > 0)
  )
);
CREATE INDEX ix_calendar_owner_time ON hucescholar.calendar_items(user_id, starts_at, id);
CREATE INDEX ix_calendar_open_tasks ON hucescholar.calendar_items(user_id, starts_at, id)
  WHERE kind = 'TASK' AND done_at IS NULL;
CREATE INDEX ix_calendar_version ON hucescholar.calendar_items(version_id);
COMMENT ON TABLE hucescholar.calendar_items IS
  'Lịch học và việc cần làm riêng của người dùng; chỉ chủ đọc/ghi, admin không xem.';
COMMENT ON COLUMN hucescholar.calendar_items.starts_at IS
  'EVENT: giờ bắt đầu (bắt buộc). TASK: hạn, NULL là việc chưa có ngày.';
COMMENT ON COLUMN hucescholar.calendar_items.all_day IS
  'Cả ngày: starts_at là nửa đêm theo giờ máy người tạo.';
COMMENT ON COLUMN hucescholar.calendar_items.version_id IS
  'Phiên bản học liệu liên quan; chỉ trả link khi người dùng còn đọc được.';
COMMIT;
