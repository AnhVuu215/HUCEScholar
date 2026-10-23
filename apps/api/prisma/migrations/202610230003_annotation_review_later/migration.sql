BEGIN;
-- LEARN-02: a private "review later" mark on one's own page note or highlight.
-- Setting it does not change the content revision, so an open edit draft stays valid.
ALTER TABLE hucescholar.annotations
  ADD COLUMN review_later boolean NOT NULL DEFAULT false;
CREATE INDEX ix_annotation_review_later
  ON hucescholar.annotations(user_id, version_id, page_number, id) WHERE review_later;
COMMENT ON COLUMN hucescholar.annotations.review_later IS
  'Chủ ghi chú đánh dấu "Cần xem lại"; riêng tư, không gửi giảng viên, không tăng revision.';
COMMIT;
