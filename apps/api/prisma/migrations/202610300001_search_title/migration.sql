BEGIN;
-- SEARCH-03: the folded title on its own, so library search can rank title matches above
-- author-only matches without folding at query time (~58 µs per row, see SEARCH-01).
ALTER TABLE hucescholar.version_search ADD COLUMN folded_title text;
UPDATE hucescholar.version_search s SET folded_title = hucescholar.fold_vi(v.title)
FROM hucescholar.document_versions v WHERE v.id = s.version_id;
ALTER TABLE hucescholar.version_search ALTER COLUMN folded_title SET NOT NULL;
COMMENT ON COLUMN hucescholar.version_search.folded_title IS
  'Riêng tiêu đề đã bỏ dấu, để xếp kết quả khớp tiêu đề lên trước; do trigger duy trì.';

CREATE OR REPLACE FUNCTION hucescholar.refresh_version_search() RETURNS trigger
LANGUAGE plpgsql SET search_path = hucescholar, pg_temp AS $$
BEGIN
  INSERT INTO version_search(version_id, folded, folded_title)
  VALUES (NEW.id, fold_vi(NEW.title || ' ' || NEW.authors), fold_vi(NEW.title))
  ON CONFLICT (version_id) DO UPDATE
    SET folded = EXCLUDED.folded, folded_title = EXCLUDED.folded_title;
  RETURN NULL;
END $$;
COMMIT;
