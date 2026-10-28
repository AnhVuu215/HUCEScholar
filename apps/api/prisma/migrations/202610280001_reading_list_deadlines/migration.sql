BEGIN;
-- CAL-04b: a lecturer may give each reading-list item a due date (a calendar day, no time).
-- Readers opt in per course to see those dates on their own calendar; there is still no
-- class or enrolment model, so following a course is a private preference, not membership.
ALTER TABLE hucescholar.reading_list_items ADD COLUMN due_on date
  CONSTRAINT ck_reading_item_due CHECK (due_on BETWEEN DATE '2000-01-01' AND DATE '2100-12-31');
CREATE INDEX ix_reading_item_due ON hucescholar.reading_list_items(due_on) WHERE due_on IS NOT NULL;
CREATE TABLE hucescholar.reading_list_follows (
  user_id bigint NOT NULL REFERENCES hucescholar.users(id) ON DELETE CASCADE,
  course_id bigint NOT NULL REFERENCES hucescholar.courses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);
COMMENT ON COLUMN hucescholar.reading_list_items.due_on IS
  'Hạn đọc do giảng viên đặt; ngày theo lịch, không có giờ.';
COMMENT ON TABLE hucescholar.reading_list_follows IS
  'Người đọc chọn hiện hạn danh sách đọc của môn trên lịch học riêng; không phải đăng ký môn.';
COMMIT;
