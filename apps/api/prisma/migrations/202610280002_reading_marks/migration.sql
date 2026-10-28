BEGIN;
-- COURSE-02: a reader's private "đã đọc" mark on a document version. It is keyed by version,
-- not by list item, so it survives a lecturer reordering or editing a list and applies to every
-- list that names the same version. Lecturers never see who has read what.
CREATE TABLE hucescholar.reading_marks (
  user_id bigint NOT NULL REFERENCES hucescholar.users(id) ON DELETE CASCADE,
  version_id bigint NOT NULL REFERENCES hucescholar.document_versions(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, version_id)
);
COMMENT ON TABLE hucescholar.reading_marks IS
  'Dấu "đã đọc" riêng của người đọc trên một phiên bản; giảng viên không xem được.';
COMMIT;
