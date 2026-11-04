BEGIN;
-- SEARCH-04: the text of each page, so the library can search inside PDFs. These are side tables
-- because tr_protect_file guards files, and text is derived: it can be rebuilt from the object.
-- file_text records that a file was tried, so a PDF that cannot be read is not retried forever.
-- pg_trgm is a trusted extension: a database owner may create it. Without its index every search
-- would scan all page text.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE TABLE hucescholar.file_text (
  file_id bigint PRIMARY KEY REFERENCES hucescholar.files(id) ON DELETE CASCADE,
  pages integer NOT NULL DEFAULT 0,
  truncated boolean NOT NULL DEFAULT false,
  attempts smallint NOT NULL DEFAULT 0,
  indexed_at timestamptz(6),
  CONSTRAINT ck_file_text_counts CHECK (pages >= 0 AND attempts >= 0)
);
COMMENT ON TABLE hucescholar.file_text IS
  'Trạng thái trích chữ của từng file PDF đã duyệt; dữ liệu suy ra, dựng lại được từ file gốc.';

CREATE TABLE hucescholar.file_pages (
  file_id bigint NOT NULL REFERENCES hucescholar.file_text(file_id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  content text NOT NULL,
  folded text NOT NULL,
  PRIMARY KEY (file_id, page_number),
  CONSTRAINT ck_file_page_number CHECK (page_number >= 1)
);
COMMENT ON TABLE hucescholar.file_pages IS
  'Chữ từng trang PDF (content) và dạng bỏ dấu để tìm (folded); chỉ đọc qua quyền của phiên bản.';

CREATE INDEX ix_file_page_folded ON hucescholar.file_pages
  USING gin (folded public.gin_trgm_ops);
COMMIT;
