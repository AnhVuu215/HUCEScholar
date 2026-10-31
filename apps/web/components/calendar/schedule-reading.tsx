'use client';
import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import {
  addDays,
  calendarError,
  createCalendarItem,
  dateKey,
  fromInputs,
} from '../../lib/calendar';
import { useNotesLeaveGuard } from '../library/use-notes-leave-guard';
import { SelectField } from '../ui/select-field';

const durations = [30, 45, 60, 90, 120];
const DEFAULT_CLOCK = '19:00';
const DEFAULT_MINUTES = '60';

const purposes = {
  read: { action: 'Lên lịch đọc', noun: 'buổi đọc', prefix: 'Đọc', color: 'green' },
  review: { action: 'Lên lịch ôn', noun: 'buổi ôn', prefix: 'Ôn', color: 'orange' },
} as const;

/**
 * CAL-01 "Lên lịch đọc": books a study session that reopens this version at the current page.
 * CAL-04 reuses it as "Lên lịch ôn" for a "cần xem lại" mark.
 * The request id is fixed while the form is open, so a retry cannot create a duplicate.
 */
export function ScheduleReading({
  versionId,
  pageNumber,
  title,
  disabled,
  purpose = 'read',
  onCreated,
}: {
  versionId: string;
  pageNumber: number;
  title: string;
  disabled?: boolean;
  purpose?: keyof typeof purposes;
  /** Set on the calendar page itself: it refreshes instead of linking to the calendar. */
  onCreated?: () => void;
}) {
  const text = purposes[purpose];
  const fieldId = useId();
  const [requestId, setRequestId] = useState<string | null>(null);
  /** Tomorrow as of opening; the form only counts as a draft once a field moves off its defaults. */
  const [openedDay, setOpenedDay] = useState('');
  const [day, setDay] = useState('');
  const [clock, setClock] = useState(DEFAULT_CLOCK);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);
  const dirty =
    requestId !== null &&
    (day !== openedDay || clock !== DEFAULT_CLOCK || minutes !== DEFAULT_MINUTES);
  useNotesLeaveGuard(
    dirty,
    busy,
    `Bạn có ${text.noun} chưa thêm vào lịch. Rời trang và bỏ thay đổi?`,
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!requestId) return;
    const start = fromInputs(day, clock);
    if (!start) {
      setError('Chọn ngày và giờ bắt đầu.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createCalendarItem(
        {
          kind: 'EVENT',
          title:
            `${text.prefix}: ${title}${purpose === 'review' ? ` (trang ${pageNumber})` : ''}`.slice(
              0,
              200,
            ),
          details: '',
          startsAt: start.toISOString(),
          endsAt: new Date(start.getTime() + Number(minutes) * 60_000).toISOString(),
          allDay: false,
          color: text.color,
          versionId,
          pageNumber,
        },
        requestId,
      );
      setRequestId(null);
      setCreated(true);
      onCreated?.();
    } catch (failure) {
      setError(calendarError(failure));
    } finally {
      setBusy(false);
    }
  }
  if (!requestId)
    return (
      <div className="schedule-reading">
        <button
          type="button"
          className="secondary-button"
          disabled={disabled}
          onClick={() => {
            const tomorrow = dateKey(addDays(new Date(), 1));
            setRequestId(crypto.randomUUID());
            setOpenedDay(tomorrow);
            setDay(tomorrow);
            setClock(DEFAULT_CLOCK);
            setMinutes(DEFAULT_MINUTES);
            setCreated(false);
            setError('');
          }}
        >
          {text.action}
        </button>
        {created && (
          <p role="status" className="field-hint">
            Đã thêm {text.noun} vào lịch.
            {!onCreated && (
              <>
                {' '}
                <Link href="/workspace/calendar">Xem lịch học</Link>
              </>
            )}
          </p>
        )}
      </div>
    );
  return (
    <form className="schedule-reading" onSubmit={submit} aria-label={text.action}>
      <p className="field-hint">
        {text.noun[0].toUpperCase() + text.noun.slice(1)} sẽ mở lại tài liệu này ở trang{' '}
        {pageNumber}.
      </p>
      <div className="calendar-when">
        <div className="form-field">
          <label htmlFor={`${fieldId}-schedule-day`}>Ngày</label>
          <input
            id={`${fieldId}-schedule-day`}
            type="date"
            required
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor={`${fieldId}-schedule-time`}>Giờ bắt đầu</label>
          <input
            id={`${fieldId}-schedule-time`}
            type="time"
            required
            value={clock}
            onChange={(e) => setClock(e.target.value)}
          />
        </div>
        <SelectField
          id={`${fieldId}-schedule-minutes`}
          label="Thời lượng"
          value={minutes}
          onChange={setMinutes}
          options={durations.map((value) => ({ value: String(value), label: `${value} phút` }))}
        />
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="note-actions">
        <button className="primary-button" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Thêm vào lịch'}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => {
            setRequestId(null);
            setError('');
          }}
        >
          Hủy
        </button>
      </div>
    </form>
  );
}
