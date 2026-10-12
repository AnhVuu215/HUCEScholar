BEGIN;
CREATE FUNCTION hucescholar.revoke_user_sessions() RETURNS trigger
LANGUAGE plpgsql SET search_path = hucescholar, pg_catalog AS $$
BEGIN
  IF ROW(NEW.status, NEW.password_hash, NEW.role, NEW.verified_at)
     IS DISTINCT FROM ROW(OLD.status, OLD.password_hash, OLD.role, OLD.verified_at) THEN
    UPDATE auth_sessions SET revoked_at = greatest(clock_timestamp(), created_at)
    WHERE user_id = NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_revoke_user_sessions
AFTER UPDATE OF status, password_hash, role, verified_at ON hucescholar.users
FOR EACH ROW EXECUTE FUNCTION hucescholar.revoke_user_sessions();
COMMIT;
