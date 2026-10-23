BEGIN;
-- A PDF the scanner never answered for (CHECK_UNAVAILABLE) can be checked again as is. Each
-- round has its own notice key (file:<id> for the first, file:<id>:<round> after), so the
-- outcome of a second check is not swallowed by the first one's notice.
ALTER TABLE hucescholar.files
  ADD COLUMN check_round smallint NOT NULL DEFAULT 1
    CONSTRAINT ck_file_check_round CHECK (check_round BETWEEN 1 AND 100);
COMMENT ON COLUMN hucescholar.files.check_round IS
  'Lần kiểm tra thứ mấy; tăng khi chủ bản nháp bấm "Kiểm tra lại" sau CHECK_UNAVAILABLE.';
COMMIT;
