BEGIN;
-- UPLOAD-03: tell uploaders why a PDF failed, and accept PDFs that open without a password
-- but forbid copying. Existing rows keep NULL / false: their reason was never recorded.
ALTER TABLE hucescholar.files
  ADD COLUMN check_error varchar(24),
  ADD COLUMN copy_restricted boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT ck_file_check_error CHECK (
    check_error IS NULL OR (
      scan_status = 'FAILED'
      AND check_error IN ('MALWARE','PASSWORD_PROTECTED','INVALID_PDF','TOO_MANY_PAGES','CHECK_UNAVAILABLE')
    )
  );
COMMENT ON COLUMN hucescholar.files.check_error IS
  'Mã lý do không đạt kiểm tra (không chứa thông điệp công cụ); NULL khi chưa rõ hoặc chưa lỗi.';
COMMENT ON COLUMN hucescholar.files.copy_restricted IS
  'PDF mở không cần mật khẩu nhưng tác giả cấm sao chép; API không cho tô chữ.';

CREATE OR REPLACE FUNCTION hucescholar.protect_file_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = hucescholar, pg_temp AS $$
BEGIN
  IF ROW(NEW.object_key, NEW.sha256, NEW.byte_size, NEW.mime_type, NEW.uploaded_by)
     IS DISTINCT FROM ROW(OLD.object_key, OLD.sha256, OLD.byte_size, OLD.mime_type, OLD.uploaded_by)
     OR (OLD.scan_status = 'SAFE' AND ROW(NEW.page_count, NEW.copy_restricted)
         IS DISTINCT FROM ROW(OLD.page_count, OLD.copy_restricted)) THEN
    RAISE EXCEPTION 'File identity and parsed page count are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
COMMIT;
