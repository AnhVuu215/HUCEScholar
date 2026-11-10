BEGIN;
-- ROLE-01 (10/11/2026): the system keeps two roles, ADMIN and STUDENT. Students upload every
-- material and an admin reviews it before publication; lecturer self-publication, course
-- assignments and handover are gone. Admins manage the reading list of each course.

-- Former lecturers keep their account, documents, notes and history as students. Changing the
-- role fires tr_revoke_sessions, so they sign in again with the new role.
UPDATE hucescholar.users SET role = 'STUDENT', revision = revision + 1, updated_at = now()
  WHERE role = 'LECTURER';
ALTER TABLE hucescholar.users DROP CONSTRAINT users_role_check,
  ADD CONSTRAINT ck_user_role CHECK (role IN ('ADMIN','STUDENT'));
COMMENT ON TABLE hucescholar.users IS
  'Tài khoản nội bộ; role ADMIN hoặc STUDENT. Sinh viên tự đăng ký qua email (AUTH-04); ADMIN chỉ do admin cấp. Chưa có SSO.';

-- Every document is now one kind: material a student uploads for admin review.
DROP INDEX hucescholar.ix_document_manager;
CREATE OR REPLACE FUNCTION hucescholar.protect_document_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = hucescholar, pg_temp AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Document original creator is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
ALTER TABLE hucescholar.documents DROP COLUMN kind;
CREATE INDEX ix_document_manager ON hucescholar.documents(manager_id);

-- New versions are only published by admin review. Approved versions that a lecturer published
-- before this change keep LECTURER_SELF: they are immutable history and must not read as reviewed.
COMMENT ON COLUMN hucescholar.document_versions.publication_method IS
  'ADMIN_REVIEW: admin duyệt. LECTURER_SELF: dữ liệu cũ do giảng viên tự công bố trước ROLE-01; không tạo mới.';

-- Assignments only existed to scope lecturer publishing. Their audit events stay in audit_events.
DROP TABLE hucescholar.lecturer_assignments;
COMMENT ON TABLE hucescholar.ownership_transfers IS
  'Lịch sử bàn giao giáo trình trước ROLE-01; chỉ đọc, không tạo mới.';

-- One reading list per course, kept by admins. Where several lecturers had a list for the same
-- course, keep the published one edited last; the rest and their items are removed. owner_id now
-- records the admin (or former lecturer) who last saved the list.
DELETE FROM hucescholar.reading_lists r USING (
  SELECT id, row_number() OVER (
    PARTITION BY course_id ORDER BY published DESC, updated_at DESC, id DESC) AS rank
  FROM hucescholar.reading_lists
) ranked WHERE r.id = ranked.id AND ranked.rank > 1;
ALTER TABLE hucescholar.reading_lists DROP CONSTRAINT ux_reading_list_owner,
  ADD CONSTRAINT ux_reading_list_course UNIQUE (course_id);
CREATE INDEX ix_reading_list_owner ON hucescholar.reading_lists(owner_id);
COMMENT ON TABLE hucescholar.reading_lists IS
  'Danh sách đọc duy nhất của một môn, do admin soạn; chỉ hiện với người đọc khi published.';
COMMENT ON COLUMN hucescholar.reading_lists.owner_id IS 'Người lưu danh sách gần nhất.';
COMMENT ON COLUMN hucescholar.reading_list_items.version_id IS
  'Phiên bản cụ thể admin chọn; không tự chuyển sang bản mới.';
COMMENT ON COLUMN hucescholar.reading_list_items.due_on IS
  'Hạn đọc do admin đặt; ngày theo lịch, không có giờ.';
COMMENT ON TABLE hucescholar.reading_marks IS
  'Dấu "đã đọc" riêng của người đọc trên một phiên bản; admin không xem được.';
COMMIT;
