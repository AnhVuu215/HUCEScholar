-- Metadata can be saved before uploading a PDF. Other states still require a file.
ALTER TABLE hucescholar.document_versions ALTER COLUMN file_id DROP NOT NULL;
ALTER TABLE hucescholar.document_versions ADD CONSTRAINT ck_version_file_before_review
  CHECK (file_id IS NOT NULL OR review_status = 'DRAFT');
COMMENT ON COLUMN hucescholar.document_versions.file_id IS 'PDF của phiên bản; null chỉ ở DRAFT trước upload. Không có file không đồng nghĩa CHECKING hoặc SAFE.';
