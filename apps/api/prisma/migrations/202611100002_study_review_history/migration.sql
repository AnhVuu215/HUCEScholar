BEGIN;
-- STUDY-04: one row per saved answer in a scheduled review. Deleting a card keeps the row (card_id
-- goes NULL) so the owner's totals do not shrink; it holds no card text.
CREATE TABLE hucescholar.study_card_reviews (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES hucescholar.users(id) ON DELETE CASCADE,
  card_id bigint REFERENCES hucescholar.study_cards(id) ON DELETE SET NULL,
  reviewed_on date NOT NULL,
  result varchar(8) NOT NULL CONSTRAINT ck_study_review_result CHECK (result IN ('KNOWN','AGAIN')),
  box_after smallint NOT NULL CONSTRAINT ck_study_review_box CHECK (box_after BETWEEN 1 AND 6),
  created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX ix_study_review_owner ON hucescholar.study_card_reviews (user_id, reviewed_on);
CREATE INDEX ix_study_review_card ON hucescholar.study_card_reviews (card_id);
COMMENT ON TABLE hucescholar.study_card_reviews IS
  'Lịch sử từng lần ôn theo lịch của chủ thẻ; chỉ dùng cho thống kê riêng của chính họ.';
COMMENT ON COLUMN hucescholar.study_card_reviews.reviewed_on IS 'Ngày ôn theo giờ Việt Nam.';

-- Off until the owner asks: a daily nudge is unwelcome by default.
ALTER TABLE hucescholar.user_preferences
  ADD COLUMN study_reminder varchar(8) NOT NULL DEFAULT 'OFF'
  CONSTRAINT ck_preference_study_reminder CHECK (study_reminder IN ('OFF','BELL','EMAIL'));
COMMENT ON COLUMN hucescholar.user_preferences.study_reminder IS
  'Nhắc thẻ đến hạn mỗi sáng: OFF không nhắc, BELL chuông thông báo, EMAIL chuông và email.';

-- The daily notice is about the owner's cards, not one document or calendar item. Its detail is
-- the number of due cards; every other kind keeps a reason code there.
ALTER TABLE hucescholar.notifications
  DROP CONSTRAINT ck_notification_detail,
  ADD CONSTRAINT ck_notification_detail CHECK (
    detail IS NULL OR detail ~ '^[A-Z_]+$'
    OR (kind = 'STUDY_CARDS_DUE' AND detail ~ '^[1-9][0-9]{0,8}$'));
ALTER TABLE hucescholar.notifications
  DROP CONSTRAINT ck_notification_kind,
  ADD CONSTRAINT ck_notification_kind CHECK (kind IN (
    'FILE_SAFE','FILE_FAILED','SOURCE_READY','SOURCE_FAILED',
    'REVIEW_APPROVED','REVIEW_CHANGES_REQUIRED','REVIEW_REJECTED',
    'REPORT_RESOLVED','REPORT_DISMISSED','CALENDAR_REMINDER',
    'READING_DEADLINE_SOON','READING_DEADLINE_CHANGED','STUDY_CARDS_DUE')),
  DROP CONSTRAINT ck_notification_target,
  ADD CONSTRAINT ck_notification_target CHECK (
    CASE
      WHEN kind = 'CALENDAR_REMINDER' THEN calendar_item_id IS NOT NULL AND event_at IS NOT NULL
        AND document_id IS NULL AND version_id IS NULL
      WHEN kind = 'READING_DEADLINE_SOON' THEN calendar_item_id IS NULL AND event_at IS NOT NULL
        AND document_id IS NOT NULL AND version_id IS NOT NULL
      WHEN kind = 'READING_DEADLINE_CHANGED' THEN calendar_item_id IS NULL
        AND document_id IS NOT NULL AND version_id IS NOT NULL
      WHEN kind = 'STUDY_CARDS_DUE' THEN calendar_item_id IS NULL AND event_at IS NULL
        AND document_id IS NULL AND version_id IS NULL
      ELSE calendar_item_id IS NULL AND event_at IS NULL
        AND document_id IS NOT NULL AND version_id IS NOT NULL
    END
  );
COMMIT;
