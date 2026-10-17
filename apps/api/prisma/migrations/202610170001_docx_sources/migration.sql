CREATE TABLE hucescholar.document_source_uploads (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id bigint NOT NULL REFERENCES hucescholar.document_versions(id) ON DELETE RESTRICT,
  uploaded_by bigint NOT NULL REFERENCES hucescholar.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  object_key varchar(500) NOT NULL UNIQUE,
  original_name varchar(255) NOT NULL,
  mime_type varchar(80) NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  byte_size bigint NOT NULL,
  sha256 char(64) NOT NULL,
  scan_status varchar(8) NOT NULL DEFAULT 'CHECKING',
  checked_at timestamptz,
  conversion_status varchar(12) NOT NULL DEFAULT 'QUEUED',
  error_code varchar(40),
  rendered_file_id bigint REFERENCES hucescholar.files(id) ON DELETE RESTRICT,
  converter_build varchar(200),
  processing_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_source_owner_request UNIQUE (uploaded_by, request_id),
  CONSTRAINT ux_source_version_id UNIQUE (version_id,id),
  CONSTRAINT ck_source_mime CHECK(mime_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  CONSTRAINT ck_source_size CHECK(byte_size BETWEEN 1 AND 26214400),
  CONSTRAINT ck_source_hash CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT ck_source_key CHECK(object_key ~ '^sources/[a-f0-9-]{36}\.docx$'),
  CONSTRAINT ck_source_scan CHECK(scan_status IN ('CHECKING','SAFE','FAILED')),
  CONSTRAINT ck_source_conversion CHECK(conversion_status IN ('QUEUED','RUNNING','READY','FAILED','CANCELLED')),
  CONSTRAINT ck_source_checked CHECK(scan_status<>'SAFE' OR checked_at IS NOT NULL),
  CONSTRAINT ck_source_ready CHECK(conversion_status<>'READY' OR (scan_status='SAFE' AND rendered_file_id IS NOT NULL AND converter_build IS NOT NULL)),
  CONSTRAINT ck_source_claim CHECK(conversion_status<>'RUNNING' OR (processing_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CONSTRAINT ck_source_attempts CHECK(attempt_count>=0),
  CONSTRAINT ck_source_error CHECK(error_code IS NULL OR error_code IN ('INVALID_DOCX','SCAN_FAILED','CONVERSION_FAILED','CONVERSION_TIMEOUT','PROCESSOR_UNAVAILABLE','SOURCE_SUPERSEDED','AUTHORIZATION_CHANGED'))
);
CREATE INDEX ix_source_pending ON hucescholar.document_source_uploads(id) WHERE conversion_status IN ('QUEUED','RUNNING');
ALTER TABLE hucescholar.document_versions ADD COLUMN source_upload_id bigint;
ALTER TABLE hucescholar.document_versions ADD CONSTRAINT fk_version_source_same_version FOREIGN KEY(id,source_upload_id)
  REFERENCES hucescholar.document_source_uploads(version_id,id) ON UPDATE NO ACTION ON DELETE RESTRICT;

CREATE FUNCTION hucescholar.protect_source_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=hucescholar,pg_temp AS $$
BEGIN
  IF ROW(NEW.version_id,NEW.uploaded_by,NEW.request_id,NEW.object_key,NEW.original_name,NEW.mime_type,NEW.byte_size,NEW.sha256,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.version_id,OLD.uploaded_by,OLD.request_id,OLD.object_key,OLD.original_name,OLD.mime_type,OLD.byte_size,OLD.sha256,OLD.created_at)
     OR (OLD.conversion_status='READY' AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'Source bytes and completed rendition are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_protect_source BEFORE UPDATE ON hucescholar.document_source_uploads FOR EACH ROW EXECUTE FUNCTION hucescholar.protect_source_identity();

CREATE FUNCTION hucescholar.check_source_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path=hucescholar,pg_temp AS $$
DECLARE source_id bigint; v document_versions%ROWTYPE; s document_source_uploads%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='document_versions' THEN
    SELECT * INTO v FROM document_versions WHERE id=NEW.id;
    source_id:=v.source_upload_id;
  ELSE
    source_id:=NEW.id;
    SELECT * INTO v FROM document_versions WHERE source_upload_id=source_id;
  END IF;
  IF source_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO s FROM document_source_uploads WHERE id=source_id;
  IF s.conversion_status='READY' AND NOT EXISTS (SELECT 1 FROM files WHERE id=s.rendered_file_id AND scan_status='SAFE') THEN
    RAISE EXCEPTION 'Ready source needs safe PDF' USING ERRCODE='23514';
  END IF;
  IF v.id IS NOT NULL AND ((v.file_id IS NOT NULL AND (s.conversion_status<>'READY' OR v.file_id IS DISTINCT FROM s.rendered_file_id))
      OR (v.review_status<>'DRAFT' AND s.conversion_status<>'READY')) THEN
    RAISE EXCEPTION 'Version/source snapshot mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ct_version_source_snapshot AFTER INSERT OR UPDATE ON hucescholar.document_versions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hucescholar.check_source_snapshot();
CREATE CONSTRAINT TRIGGER ct_source_snapshot AFTER INSERT OR UPDATE ON hucescholar.document_source_uploads
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hucescholar.check_source_snapshot();
REVOKE ALL ON hucescholar.document_source_uploads FROM PUBLIC;
REVOKE ALL ON SEQUENCE hucescholar.document_source_uploads_id_seq FROM PUBLIC;
