ALTER TABLE hucescholar.annotations
  ADD COLUMN request_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX ux_annotation_owner_request
  ON hucescholar.annotations(user_id, request_id);

COMMENT ON COLUMN hucescholar.annotations.request_id IS
  'Client request identity for retrying note creation; unique per owner while the note exists.';
