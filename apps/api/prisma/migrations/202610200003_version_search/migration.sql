BEGIN;
-- SEARCH-01: precomputed accent-insensitive title/author text for the library.
-- Folding at query time measured ~58 µs per row (3 s for 50k rows); a stored folded string
-- scans 50k rows in ~10 ms. It lives in a side table so approved/submitted versions, which
-- tr_protect_version keeps immutable, never need an UPDATE for this derived value.
CREATE TABLE hucescholar.version_search (
  version_id bigint PRIMARY KEY REFERENCES hucescholar.document_versions(id) ON DELETE CASCADE,
  folded text NOT NULL
);
COMMENT ON TABLE hucescholar.version_search IS
  'Tiêu đề và tác giả đã bỏ dấu (hucescholar.fold_vi) để tìm kiếm không dấu; do trigger duy trì.';

CREATE FUNCTION hucescholar.refresh_version_search() RETURNS trigger
LANGUAGE plpgsql SET search_path = hucescholar, pg_temp AS $$
BEGIN
  INSERT INTO version_search(version_id, folded)
  VALUES (NEW.id, fold_vi(NEW.title || ' ' || NEW.authors))
  ON CONFLICT (version_id) DO UPDATE SET folded = EXCLUDED.folded;
  RETURN NULL;
END $$;
CREATE TRIGGER tr_refresh_version_search
AFTER INSERT OR UPDATE OF title, authors ON hucescholar.document_versions
FOR EACH ROW EXECUTE FUNCTION hucescholar.refresh_version_search();

INSERT INTO hucescholar.version_search(version_id, folded)
SELECT id, hucescholar.fold_vi(title || ' ' || authors) FROM hucescholar.document_versions;
COMMIT;
