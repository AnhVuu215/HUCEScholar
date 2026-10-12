ALTER TABLE hucescholar.programs ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE hucescholar.programs ADD CONSTRAINT programs_revision_positive CHECK (revision > 0);
