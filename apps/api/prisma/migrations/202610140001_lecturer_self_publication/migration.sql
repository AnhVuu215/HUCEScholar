ALTER TABLE hucescholar.document_versions
  ADD COLUMN publication_method varchar(20) NOT NULL DEFAULT 'ADMIN_REVIEW',
  ADD CONSTRAINT ck_publication_method
    CHECK (publication_method IN ('ADMIN_REVIEW', 'LECTURER_SELF')),
  ADD CONSTRAINT ck_self_publication_terminal
    CHECK (publication_method <> 'LECTURER_SELF' OR review_status = 'APPROVED');

COMMENT ON COLUMN hucescholar.document_versions.publication_method IS
  'How a version was published: existing admin review or explicit lecturer self-publication. Not client-selectable.';
