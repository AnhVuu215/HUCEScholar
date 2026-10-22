'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  addDays,
  calendarError,
  createCalendarItem,
  dateKey,
  fromInputs,
} from '../../lib/calendar';
import { SelectField } from '../ui/select-field';

const durations = [30, 45, 60, 90, 120];

/**
 * CAL-01 "Lên lịch đọc": books a study session that reopens this version at the current page.
 * The request id is fixed while the form is open, so a retry cannot create a duplicate.
 */
export function ScheduleReading({
  versionId,
  pageNumber,
  title,
  disabled,
}: {
  versionId: string;
  pageNumber: number;
  title: string;
  disabled?: boolean;
}) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [day, setDay] = useState('');
  const [clock, setClock] = useState('19:00');
  const [minutes, setMinutes] = useState('60');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);
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
          title: `Đọc: ${title}`.slice(0, 200),
          details: '',
          startsAt: start.toISOString(),
          endsAt: new Date(start.getTime() + Number(minutes) * 60_000).toISOString(),
          allDay: false,
          color: 'green',
          versionId,
          pageNumber,
        },
        requestId,
      );
      setRequestId(null);
      setCreated(true);
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
            setRequestId(crypto.randomUUID());
            setDay(dateKey(addDays(new Date(), 1)));
            setCreated(false);
            setError('');
          }}
        >
          Lên lịch đọc
        </button>
        {created && (
          <p role="status" className="field-hint">
            Đã thêm buổi đọc vào lịch. <Link href="/workspace/calendar">Xem lịch học</Link>
          </p>
        )}
      </div>
    );
  return (
    <form className="schedule-reading" onSubmit={submit} aria-label="Lên lịch đọc">
      <p className="field-hint">Buổi đọc sẽ mở lại tài liệu này ở trang {pageNumber}.</p>
      <div className="calendar-when">
        <div className="form-field">
          <label htmlFor="schedule-day">Ngày</label>
          <input
            id="schedule-day"
            type="date"
            required
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="schedule-time">Giờ bắt đầu</label>
          <input
            id="schedule-time"
            type="time"
            required
            value={clock}
            onChange={(e) => setClock(e.target.value)}
          />
        </div>
        <SelectField
          id="schedule-minutes"
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
