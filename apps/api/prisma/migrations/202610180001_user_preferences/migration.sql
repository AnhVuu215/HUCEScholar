BEGIN;
CREATE TABLE hucescholar.user_preferences (
  user_id bigint PRIMARY KEY REFERENCES hucescholar.users(id) ON DELETE CASCADE,
  highlight_color varchar(7) NOT NULL DEFAULT '#FFF59D'
    CONSTRAINT ck_preferences_color CHECK (highlight_color IN ('#FFF59D','#A5D6A7','#90CAF9','#F8BBD0','#CE93D8','#FFCC80','#80CBC4','#B0BEC5')),
  default_zoom varchar(16) NOT NULL DEFAULT 'fit-width'
    CONSTRAINT ck_preferences_zoom CHECK (default_zoom IN ('fit-width','100','125','150')),
  annotation_panel_open boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CONSTRAINT ck_preferences_revision CHECK (revision BETWEEN 1 AND 2147483646),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
