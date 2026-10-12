ALTER TABLE hucescholar.faculties ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE hucescholar.faculties ADD CONSTRAINT faculties_revision_positive CHECK (revision > 0);
