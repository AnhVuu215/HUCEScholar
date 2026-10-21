BEGIN;
-- COURSE-01: a lecturer's reading list for one course they are assigned to. Each item pins
-- one exact document version, so students open what the lecturer chose even after a newer
-- version is published. Visibility follows normal library access; no class/enrolment model.
CREATE TABLE hucescholar.reading_lists (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id bigint NOT NULL REFERENCES hucescholar.courses(id) ON DELETE RESTRICT,
  owner_id bigint NOT NULL REFERENCES hucescholar.users(id) ON DELETE RESTRICT,
  title varchar(200) NOT NULL CONSTRAINT ck_reading_list_title CHECK (btrim(title) <> ''),
  published boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1
    CONSTRAINT ck_reading_list_revision CHECK (revision BETWEEN 1 AND 2147483646),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_reading_list_owner UNIQUE (course_id, owner_id)
);
CREATE TABLE hucescholar.reading_list_items (
  list_id bigint NOT NULL REFERENCES hucescholar.reading_lists(id) ON DELETE CASCADE,
  position smallint NOT NULL CONSTRAINT ck_reading_item_position CHECK (position BETWEEN 1 AND 100),
  section varchar(120) NOT NULL DEFAULT '',
  version_id bigint NOT NULL REFERENCES hucescholar.document_versions(id) ON DELETE RESTRICT,
  note varchar(500) NOT NULL DEFAULT '',
  PRIMARY KEY (list_id, position)
);
CREATE INDEX ix_reading_list_published ON hucescholar.reading_lists(course_id) WHERE published;
CREATE INDEX ix_reading_item_version ON hucescholar.reading_list_items(version_id);
COMMENT ON TABLE hucescholar.reading_lists IS
  'Danh sách đọc của một giảng viên cho một môn được phân công; chỉ hiện khi published và phân công còn hiệu lực.';
COMMENT ON COLUMN hucescholar.reading_list_items.version_id IS
  'Phiên bản cụ thể giảng viên chọn; không tự chuyển sang bản mới.';
COMMIT;
