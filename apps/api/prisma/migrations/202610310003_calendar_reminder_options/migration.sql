BEGIN;
-- CAL-07: up to three reminders per item (the first stays in remind_minutes, which the worker's
-- indexes use), and reminders for all-day items at a time of day. An all-day item starts at the
-- owner's local midnight, so its leads may be negative: -480 is 08:00 that day, 240 is 20:00 and
-- 960 is 08:00 the day before.
ALTER TABLE hucescholar.calendar_items
  ADD COLUMN remind_more smallint[] NOT NULL DEFAULT '{}',
  DROP CONSTRAINT ck_calendar_remind,
  ADD CONSTRAINT ck_calendar_remind CHECK (
    remind_minutes IS NULL OR (
      starts_at IS NOT NULL AND (
        (NOT all_day AND remind_minutes IN (0, 5, 10, 15, 30, 60, 120, 1440))
        OR (all_day AND remind_minutes IN (-480, 240, 960))
      )
    )
  ),
  ADD CONSTRAINT ck_calendar_remind_more CHECK (
    cardinality(remind_more) <= 2
    AND (cardinality(remind_more) = 0 OR remind_minutes IS NOT NULL)
    AND array_position(remind_more, NULL) IS NULL
    AND NOT (remind_minutes = ANY (remind_more))
    AND (remind_more[1] IS DISTINCT FROM remind_more[2] OR cardinality(remind_more) < 2)
    AND remind_more <@ (CASE WHEN all_day THEN '{-480,240,960}'
      ELSE '{0,5,10,15,30,60,120,1440}' END)::smallint[]
  );
COMMENT ON COLUMN hucescholar.calendar_items.remind_more IS
  'Tối đa hai lời nhắc thêm (phút trước giờ bắt đầu), khác remind_minutes và khác nhau.';

-- Account-wide: whether calendar reminders may be emailed at all; each item still opts in.
ALTER TABLE hucescholar.user_preferences
  ADD COLUMN reminder_email boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN hucescholar.user_preferences.reminder_email IS
  'Tắt để không nhận email nhắc lịch nào, kể cả mục đã bật "Gửi cả email".';
COMMIT;
