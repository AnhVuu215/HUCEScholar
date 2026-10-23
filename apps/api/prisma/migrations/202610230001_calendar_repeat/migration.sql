BEGIN;
-- CAL-02: weekly repeating study sessions. Weekdays and the last date are local to the UTC offset
-- the owner's device had when saving; occurrences are whole days (24 h) after the first one.
ALTER TABLE hucescholar.calendar_items
  ADD COLUMN repeat_days smallint,
  ADD COLUMN repeat_until date,
  ADD COLUMN repeat_utc_offset smallint,
  ADD CONSTRAINT ck_calendar_repeat_shape CHECK (
    (repeat_days IS NULL AND repeat_until IS NULL AND repeat_utc_offset IS NULL)
    OR (
      kind = 'EVENT' AND repeat_days BETWEEN 1 AND 127 AND repeat_until IS NOT NULL
      AND repeat_utc_offset BETWEEN -840 AND 840
    )
  ),
  -- The first session is the first occurrence: its weekday is selected and the series ends
  -- on or after it, at most 366 days later.
  ADD CONSTRAINT ck_calendar_repeat_start CHECK (
    repeat_days IS NULL OR (
      (repeat_days::int >> (extract(isodow FROM (starts_at AT TIME ZONE 'UTC')
        + make_interval(mins => repeat_utc_offset))::int - 1)) & 1 = 1
      AND repeat_until >= ((starts_at AT TIME ZONE 'UTC')
        + make_interval(mins => repeat_utc_offset))::date
      AND repeat_until <= ((starts_at AT TIME ZONE 'UTC')
        + make_interval(mins => repeat_utc_offset))::date + 366
    )
  );
CREATE INDEX ix_calendar_series ON hucescholar.calendar_items(user_id, repeat_until)
  WHERE repeat_days IS NOT NULL;
COMMENT ON COLUMN hucescholar.calendar_items.repeat_days IS
  'Lặp hằng tuần: bit 0 = thứ Hai … bit 6 = Chủ nhật, theo giờ máy lúc lưu. NULL là không lặp.';
COMMENT ON COLUMN hucescholar.calendar_items.repeat_until IS
  'Ngày cuối (tính cả) có thể có buổi, theo giờ máy lúc lưu; tối đa 366 ngày sau buổi đầu.';
COMMENT ON COLUMN hucescholar.calendar_items.repeat_utc_offset IS
  'Độ lệch giờ (phút) của máy lúc lưu, dùng để tính thứ và ngày của từng buổi.';

-- Occurrences the owner removed from a series ("Chỉ buổi này": delete, or detach into its own item).
CREATE TABLE hucescholar.calendar_item_skips (
  item_id bigint NOT NULL REFERENCES hucescholar.calendar_items(id) ON DELETE CASCADE,
  occurrence_start timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, occurrence_start)
);
COMMENT ON TABLE hucescholar.calendar_item_skips IS
  'Buổi đã bỏ khỏi một chuỗi lịch học lặp; xóa khi chuỗi đổi giờ, thứ hoặc ngày cuối.';
COMMIT;
