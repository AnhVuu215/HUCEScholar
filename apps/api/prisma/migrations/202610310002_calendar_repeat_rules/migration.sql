BEGIN;
-- CAL-07: weekly or monthly repeats, every 1-12 weeks or months, ending on a date or after a
-- number of times, for sessions and dated tasks. A count is kept with the date it implies, so
-- every series still has a last date. Existing series are weekly, every week, without a count.
ALTER TABLE hucescholar.calendar_items
  ADD COLUMN repeat_freq varchar(8),
  ADD COLUMN repeat_interval smallint,
  ADD COLUMN repeat_count smallint;
UPDATE hucescholar.calendar_items SET repeat_freq = 'WEEKLY', repeat_interval = 1
  WHERE repeat_days IS NOT NULL;
ALTER TABLE hucescholar.calendar_items
  DROP CONSTRAINT ck_calendar_repeat_shape,
  ADD CONSTRAINT ck_calendar_repeat_shape CHECK (
    (repeat_freq IS NULL AND repeat_days IS NULL AND repeat_until IS NULL
      AND repeat_utc_offset IS NULL AND repeat_interval IS NULL AND repeat_count IS NULL)
    -- Every part is spelled out as IS NOT NULL: a CHECK that evaluates to NULL passes.
    OR (
      repeat_freq IS NOT NULL AND starts_at IS NOT NULL AND repeat_until IS NOT NULL
      AND repeat_utc_offset IS NOT NULL AND repeat_utc_offset BETWEEN -840 AND 840
      AND repeat_interval IS NOT NULL AND repeat_interval BETWEEN 1 AND 12
      AND (repeat_count IS NULL OR repeat_count BETWEEN 1 AND 400)
      AND ((repeat_freq = 'WEEKLY' AND repeat_days IS NOT NULL AND repeat_days BETWEEN 1 AND 127)
        OR (repeat_freq = 'MONTHLY' AND repeat_days IS NULL))
    )
  ),
  -- A weekly series starts on one of its weekdays; every series ends on or after its first
  -- date and at most 366 days later.
  DROP CONSTRAINT ck_calendar_repeat_start,
  ADD CONSTRAINT ck_calendar_repeat_start CHECK (
    repeat_freq IS NULL OR (
      (repeat_freq <> 'WEEKLY'
        OR (repeat_days::int >> (extract(isodow FROM (starts_at AT TIME ZONE 'UTC')
          + make_interval(mins => repeat_utc_offset))::int - 1)) & 1 = 1)
      AND repeat_until >= ((starts_at AT TIME ZONE 'UTC')
        + make_interval(mins => repeat_utc_offset))::date
      AND repeat_until <= ((starts_at AT TIME ZONE 'UTC')
        + make_interval(mins => repeat_utc_offset))::date + 366
    )
  ),
  -- A repeating task is done one occurrence at a time, in calendar_item_done.
  ADD CONSTRAINT ck_calendar_series_done CHECK (repeat_freq IS NULL OR done_at IS NULL);
COMMENT ON COLUMN hucescholar.calendar_items.repeat_freq IS
  'WEEKLY (theo thứ trong repeat_days) hoặc MONTHLY (theo ngày trong tháng của lần đầu); NULL là không lặp.';
COMMENT ON COLUMN hucescholar.calendar_items.repeat_interval IS
  'Lặp mỗi bao nhiêu tuần hoặc tháng (1–12).';
COMMENT ON COLUMN hucescholar.calendar_items.repeat_count IS
  'Kết thúc sau bao nhiêu lần; repeat_until khi đó là ngày của lần cuối. NULL là kết thúc theo ngày.';
DROP INDEX hucescholar.ix_calendar_series;
CREATE INDEX ix_calendar_series ON hucescholar.calendar_items(user_id, repeat_until)
  WHERE repeat_freq IS NOT NULL;
DROP INDEX hucescholar.ix_calendar_remind_single;
CREATE INDEX ix_calendar_remind_single ON hucescholar.calendar_items(starts_at)
  WHERE remind_minutes IS NOT NULL AND repeat_freq IS NULL AND done_at IS NULL;
DROP INDEX hucescholar.ix_calendar_remind_series;
CREATE INDEX ix_calendar_remind_series ON hucescholar.calendar_items(repeat_until)
  WHERE remind_minutes IS NOT NULL AND repeat_freq IS NOT NULL;

CREATE TABLE hucescholar.calendar_item_done (
  item_id bigint NOT NULL REFERENCES hucescholar.calendar_items(id) ON DELETE CASCADE,
  occurrence_start timestamptz NOT NULL,
  done_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, occurrence_start)
);
COMMENT ON TABLE hucescholar.calendar_item_done IS
  'Lần đã xong của một việc cần làm lặp lại; xóa khi chuỗi đổi giờ, kiểu lặp hoặc ngày cuối.';
COMMIT;
