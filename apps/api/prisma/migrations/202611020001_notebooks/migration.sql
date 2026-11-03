BEGIN;
-- CANVAS-01: "Vở ghi", free-form notebooks private to their owner. A notebook holds ordered pages;
-- a page stores its drawing as a vector document (jsonb) validated by the API. Images live in the
-- private store, re-encoded by the API and checked by the file worker before they are served.

CREATE TABLE hucescholar.notebooks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL,
  user_id bigint NOT NULL REFERENCES hucescholar.users(id) ON DELETE CASCADE,
  title varchar(120) NOT NULL CONSTRAINT ck_notebook_title CHECK (btrim(title) <> ''),
  cover varchar(12) NOT NULL DEFAULT 'navy' CONSTRAINT ck_notebook_cover CHECK (
    cover IN ('navy', 'sky', 'green', 'mint', 'orange', 'red', 'pink', 'purple', 'kraft', 'charcoal')
  ),
  course_id bigint REFERENCES hucescholar.courses(id) ON DELETE SET NULL,
  default_size varchar(16) NOT NULL DEFAULT 'A4_PORTRAIT' CONSTRAINT ck_notebook_default_size
    CHECK (default_size IN ('A4_PORTRAIT', 'A4_LANDSCAPE', 'INFINITE')),
  default_paper varchar(16) NOT NULL DEFAULT 'RULED_NARROW' CONSTRAINT ck_notebook_default_paper
    CHECK (default_paper IN ('BLANK', 'RULED_NARROW', 'RULED_WIDE', 'GRID', 'DOT', 'CORNELL', 'O_LI', 'MUSIC')),
  default_color varchar(8) NOT NULL DEFAULT 'white' CONSTRAINT ck_notebook_default_color
    CHECK (default_color IN ('white', 'cream', 'yellow', 'gray', 'dark')),
  revision integer NOT NULL DEFAULT 1
    CONSTRAINT ck_notebook_revision CHECK (revision BETWEEN 1 AND 2147483646),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT ux_notebook_request UNIQUE (user_id, request_id)
);
CREATE INDEX ix_notebook_owner ON hucescholar.notebooks(user_id, updated_at DESC, id)
  WHERE deleted_at IS NULL;
CREATE INDEX ix_notebook_trash ON hucescholar.notebooks(user_id, deleted_at)
  WHERE deleted_at IS NOT NULL;
CREATE INDEX ix_notebook_course ON hucescholar.notebooks(course_id) WHERE course_id IS NOT NULL;
COMMENT ON TABLE hucescholar.notebooks IS
  'Vở ghi tự do của người dùng (CANVAS-01); chỉ chủ đọc/ghi, admin không xem.';
COMMENT ON COLUMN hucescholar.notebooks.deleted_at IS
  'Thùng rác: khôi phục được trong 30 ngày, sau đó worker xóa hẳn.';

CREATE TABLE hucescholar.notebook_pages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL,
  notebook_id bigint NOT NULL REFERENCES hucescholar.notebooks(id) ON DELETE CASCADE,
  position integer NOT NULL CONSTRAINT ck_notebook_page_position CHECK (position BETWEEN 0 AND 9999),
  size varchar(16) NOT NULL CONSTRAINT ck_notebook_page_size
    CHECK (size IN ('A4_PORTRAIT', 'A4_LANDSCAPE', 'INFINITE')),
  paper varchar(16) NOT NULL CONSTRAINT ck_notebook_page_paper
    CHECK (paper IN ('BLANK', 'RULED_NARROW', 'RULED_WIDE', 'GRID', 'DOT', 'CORNELL', 'O_LI', 'MUSIC')),
  paper_color varchar(8) NOT NULL CONSTRAINT ck_notebook_page_color
    CHECK (paper_color IN ('white', 'cream', 'yellow', 'gray', 'dark')),
  content jsonb NOT NULL DEFAULT '{"v": 1, "items": []}'::jsonb
    CONSTRAINT ck_notebook_page_content CHECK (
      jsonb_typeof(content) = 'object' AND jsonb_typeof(content -> 'items') = 'array'
      AND octet_length(content::text) <= 2621440
    ),
  search_text text NOT NULL DEFAULT ''
    CONSTRAINT ck_notebook_page_search CHECK (char_length(search_text) <= 200000),
  revision integer NOT NULL DEFAULT 1
    CONSTRAINT ck_notebook_page_revision CHECK (revision BETWEEN 1 AND 2147483646),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_notebook_page_request UNIQUE (notebook_id, request_id),
  -- Deferred so inserting or reordering pages can shift positions inside one transaction.
  CONSTRAINT ux_notebook_page_position UNIQUE (notebook_id, position) DEFERRABLE INITIALLY DEFERRED
);
-- Finds pages that still place an image, for the orphan-image sweep.
CREATE INDEX ix_notebook_page_content ON hucescholar.notebook_pages
  USING gin (content jsonb_path_ops);
COMMENT ON TABLE hucescholar.notebook_pages IS
  'Trang vở: tài liệu vector (nét, chữ, ảnh, hình, sticker, thẻ trích dẫn) do API kiểm.';
COMMENT ON COLUMN hucescholar.notebook_pages.search_text IS
  'Chữ gõ trên trang, để tìm không dấu; chữ viết tay và đoạn trích dẫn không được chép vào đây.';

CREATE TABLE hucescholar.notebook_assets (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL,
  user_id bigint NOT NULL REFERENCES hucescholar.users(id) ON DELETE CASCADE,
  object_key varchar(80) NOT NULL UNIQUE
    CONSTRAINT ck_notebook_asset_key CHECK (object_key ~ '^notebook/[a-f0-9-]{36}\.webp$'),
  byte_size integer NOT NULL CONSTRAINT ck_notebook_asset_size CHECK (byte_size BETWEEN 1 AND 10485760),
  thumb_size integer NOT NULL CONSTRAINT ck_notebook_asset_thumb CHECK (thumb_size BETWEEN 1 AND 10485760),
  width integer NOT NULL CONSTRAINT ck_notebook_asset_width CHECK (width BETWEEN 1 AND 2400),
  height integer NOT NULL CONSTRAINT ck_notebook_asset_height CHECK (height BETWEEN 1 AND 2400),
  sha256 char(64) NOT NULL,
  scan_status varchar(8) NOT NULL DEFAULT 'CHECKING'
    CONSTRAINT ck_notebook_asset_scan CHECK (scan_status IN ('CHECKING', 'SAFE', 'FAILED')),
  check_error varchar(24),
  checked_at timestamptz,
  source varchar(8) NOT NULL CONSTRAINT ck_notebook_asset_source CHECK (source IN ('UPLOAD', 'URL')),
  source_host varchar(253),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_notebook_asset_request UNIQUE (user_id, request_id),
  CONSTRAINT ck_notebook_asset_host CHECK ((source = 'URL') = (source_host IS NOT NULL))
);
CREATE INDEX ix_notebook_asset_owner ON hucescholar.notebook_assets(user_id, created_at);
CREATE INDEX ix_notebook_asset_checking ON hucescholar.notebook_assets(id)
  WHERE scan_status = 'CHECKING';
COMMENT ON TABLE hucescholar.notebook_assets IS
  'Ảnh trong vở ghi: đã mã hóa lại sang WebP (bỏ EXIF), chỉ trả cho chủ khi scan_status = SAFE.';
COMMENT ON COLUMN hucescholar.notebook_assets.source_host IS
  'Tên miền ảnh được tải hộ (chỉ host, không lưu đường dẫn đầy đủ).';

-- A study session can open a notebook (CANVAS-01). The link is the owner's own notebook only.
ALTER TABLE hucescholar.calendar_items
  ADD COLUMN notebook_id bigint REFERENCES hucescholar.notebooks(id) ON DELETE SET NULL;
CREATE INDEX ix_calendar_notebook ON hucescholar.calendar_items(notebook_id)
  WHERE notebook_id IS NOT NULL;
COMMIT;
