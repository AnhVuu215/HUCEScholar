BEGIN;
-- STUDY-03: scheduled review. review_box is the Leitner box (0 = never reviewed, 6 = longest gap),
-- due_on the Vietnam calendar day the card is next due, so existing cards are due from today.
-- last_review_request makes a retried answer harmless: it never moves a card twice.
ALTER TABLE hucescholar.study_cards
  ADD COLUMN review_box smallint NOT NULL DEFAULT 0,
  ADD COLUMN due_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date,
  ADD COLUMN last_reviewed_at timestamptz(6),
  ADD COLUMN last_review_request uuid,
  ADD CONSTRAINT ck_study_card_box CHECK (review_box BETWEEN 0 AND 6);

CREATE INDEX ix_study_card_due ON hucescholar.study_cards (user_id, due_on);
COMMIT;
