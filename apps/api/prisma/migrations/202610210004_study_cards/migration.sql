BEGIN;
-- STUDY-01: private self-made question/answer cards created from one's own text highlight.
-- The card keeps its source (version, page, a snapshot of the quoted text) even if the
-- highlight is later deleted. Written by hand; no AI generation.
CREATE TABLE hucescholar.study_cards (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL,
  user_id bigint NOT NULL REFERENCES hucescholar.users(id) ON DELETE CASCADE,
  version_id bigint NOT NULL REFERENCES hucescholar.document_versions(id) ON DELETE RESTRICT,
  page_number integer NOT NULL CONSTRAINT ck_study_card_page CHECK (page_number > 0),
  annotation_id bigint REFERENCES hucescholar.annotations(id) ON DELETE SET NULL,
  quote text NOT NULL CONSTRAINT ck_study_card_quote CHECK (char_length(quote) BETWEEN 1 AND 2000),
  question varchar(500) NOT NULL CONSTRAINT ck_study_card_question CHECK (btrim(question) <> ''),
  answer varchar(2000) NOT NULL CONSTRAINT ck_study_card_answer CHECK (btrim(answer) <> ''),
  revision integer NOT NULL DEFAULT 1
    CONSTRAINT ck_study_card_revision CHECK (revision BETWEEN 1 AND 2147483646),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_study_card_request UNIQUE (user_id, request_id)
);
CREATE INDEX ix_study_card_owner ON hucescholar.study_cards(user_id, created_at DESC, id DESC);
CREATE INDEX ix_study_card_version ON hucescholar.study_cards(user_id, version_id);
CREATE INDEX ix_study_card_annotation ON hucescholar.study_cards(annotation_id);
COMMENT ON TABLE hucescholar.study_cards IS
  'Thẻ ôn tập riêng của người dùng, tạo thủ công từ đoạn tô của chính họ; chỉ chủ đọc được.';
COMMENT ON COLUMN hucescholar.study_cards.quote IS
  'Bản sao đoạn chữ đã tô lúc tạo thẻ, để thẻ vẫn có nguồn khi đoạn tô bị xóa.';
COMMIT;
