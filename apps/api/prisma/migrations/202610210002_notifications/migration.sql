BEGIN;
-- NOTIFY-01: in-app notices for the owner of an upload, a review request or a report.
-- Written by the API in the same transaction as the state change; event_key makes each
-- event notify once (a retried Word source adds a cycle number: source:<id>:<n>). No note content, admin free text or tool output is stored.
CREATE TABLE hucescholar.notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES hucescholar.users(id) ON DELETE CASCADE,
  kind varchar(24) NOT NULL CONSTRAINT ck_notification_kind CHECK (kind IN (
    'FILE_SAFE','FILE_FAILED','SOURCE_READY','SOURCE_FAILED',
    'REVIEW_APPROVED','REVIEW_CHANGES_REQUIRED','REVIEW_REJECTED',
    'REPORT_RESOLVED','REPORT_DISMISSED')),
  event_key varchar(64) NOT NULL CONSTRAINT ck_notification_event CHECK (event_key ~ '^[a-z]+:[1-9][0-9]*(:[1-9][0-9]*)?$'),
  document_id bigint NOT NULL REFERENCES hucescholar.documents(id) ON DELETE RESTRICT,
  version_id bigint NOT NULL,
  title varchar(300) NOT NULL CONSTRAINT ck_notification_title CHECK (btrim(title) <> ''),
  detail varchar(40) CONSTRAINT ck_notification_detail CHECK (detail IS NULL OR detail ~ '^[A-Z_]+$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT fk_notification_version FOREIGN KEY (document_id, version_id)
    REFERENCES hucescholar.document_versions(document_id, id) ON DELETE RESTRICT,
  CONSTRAINT ux_notification_event UNIQUE (user_id, event_key)
);
CREATE INDEX ix_notification_owner ON hucescholar.notifications(user_id, created_at DESC, id DESC);
CREATE INDEX ix_notification_unread ON hucescholar.notifications(user_id) WHERE read_at IS NULL;
COMMENT ON TABLE hucescholar.notifications IS
  'Thông báo trong ứng dụng; chỉ chủ (user_id) đọc được. Không chứa nội dung ghi chú hay lý do tự do của admin.';
COMMENT ON COLUMN hucescholar.notifications.title IS
  'Tiêu đề phiên bản tại thời điểm sự kiện, để danh sách không phụ thuộc quyền hiện tại.';
COMMENT ON COLUMN hucescholar.notifications.detail IS
  'Mã lý do (check_error hoặc error_code của nguồn Word), không phải thông điệp công cụ.';
COMMIT;
