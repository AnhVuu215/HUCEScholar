-- Database guards complement backend authorization; they do not replace it.
CREATE FUNCTION protect_version_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path = hucescholar, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.review_status IN ('SUBMITTED','APPROVED','REJECTED') THEN
      RAISE EXCEPTION 'Cannot delete submitted or terminal version' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.document_id <> OLD.document_id OR NEW.version_no <> OLD.version_no
     OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'Version identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.review_status IN ('APPROVED','REJECTED') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Terminal version is immutable; create a new version' USING ERRCODE = '23514';
  END IF;
  IF OLD.review_status = 'SUBMITTED' AND
     (to_jsonb(NEW) - ARRAY['review_status','revision','updated_at']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['review_status','revision','updated_at']) THEN
    RAISE EXCEPTION 'Withdraw submitted version before editing its snapshot' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_protect_version BEFORE UPDATE OR DELETE ON document_versions
FOR EACH ROW EXECUTE FUNCTION protect_version_snapshot();

CREATE FUNCTION protect_version_courses() RETURNS trigger
LANGUAGE plpgsql SET search_path = hucescholar, pg_temp AS $$
DECLARE state varchar(20);
BEGIN
  -- Lock the parent to serialize course changes with publication of that snapshot.
  IF TG_OP <> 'INSERT' THEN
    SELECT review_status INTO state FROM document_versions WHERE id = OLD.version_id FOR UPDATE;
    IF state NOT IN ('DRAFT','CHANGES_REQUIRED') THEN
      RAISE EXCEPTION 'Version courses are frozen' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT review_status INTO state FROM document_versions WHERE id = NEW.version_id FOR UPDATE;
    IF state NOT IN ('DRAFT','CHANGES_REQUIRED') THEN
      RAISE EXCEPTION 'Version courses are frozen' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER tr_protect_version_courses BEFORE INSERT OR UPDATE OR DELETE ON version_courses
FOR EACH ROW EXECUTE FUNCTION protect_version_courses();

CREATE FUNCTION protect_file_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = hucescholar, pg_temp AS $$
BEGIN
  IF ROW(NEW.object_key, NEW.sha256, NEW.byte_size, NEW.mime_type, NEW.uploaded_by)
     IS DISTINCT FROM ROW(OLD.object_key, OLD.sha256, OLD.byte_size, OLD.mime_type, OLD.uploaded_by)
     OR (OLD.scan_status = 'SAFE' AND NEW.page_count IS DISTINCT FROM OLD.page_count) THEN
    RAISE EXCEPTION 'File identity and parsed page count are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_protect_file BEFORE UPDATE ON files
FOR EACH ROW EXECUTE FUNCTION protect_file_identity();

CREATE FUNCTION protect_document_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = hucescholar, pg_temp AS $$
BEGIN
  IF ROW(NEW.kind, NEW.created_by) IS DISTINCT FROM ROW(OLD.kind, OLD.created_by) THEN
    RAISE EXCEPTION 'Document kind and original creator are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_protect_document BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION protect_document_identity();

CREATE FUNCTION check_current_published_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = hucescholar, pg_temp AS $$
DECLARE target_id bigint; target_state varchar(20);
BEGIN
  -- Deferred checks read final row state, rather than an obsolete queued NEW image.
  SELECT current_version_id INTO target_id FROM documents WHERE id = NEW.id;
  IF target_id IS NOT NULL THEN
    SELECT review_status INTO target_state FROM document_versions
      WHERE id = target_id AND document_id = NEW.id;
    IF target_state IS DISTINCT FROM 'APPROVED' THEN
      RAISE EXCEPTION 'Current version must be an approved version of the same document' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ct_current_published_version
AFTER INSERT OR UPDATE ON documents DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_current_published_version();
