'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  addDays,
  calendarColors,
  calendarError,
  colorLabels,
  createCalendarItem,
  dateKey,
  deleteCalendarItem,
  detachOccurrence,
  fromInputs,
  isoWeekday,
  readerHref,
  skipOccurrence,
  timeKey,
  updateCalendarItem,
  utcOffset,
  weekdayLabels,
  whenLabel,
  type CalendarColor,
  type CalendarFields,
  type CalendarItem,
  type CalendarKind,
  type CalendarRepeatInput,
} from '../../lib/calendar';

/** What a new item starts with: a clicked slot, a quick-add, or "Lên lịch đọc" in the reader. */
export type CalendarDraft = {
  kind: CalendarKind;
  start: Date | null;
  allDay?: boolean;
  title?: string;
  material?: { versionId: string; pageNumber: number; title: string };
};

const MAX_EVENT_MS = 14 * 86_400_000;
/** A new series runs for 15 weeks by default, about one HUCE semester. */
const DEFAULT_REPEAT_WEEKS = 15;
/** "one": this occurrence only (detach or skip). "all": the whole series. */
type Scope = 'one' | 'all';

/** Date and time inputs for an item; a series edited as a whole shows its first session. */
function times(item: CalendarItem, scope: Scope) {
  const whole = scope === 'all' && item.repeat;
  const startsAt = whole ? item.repeat!.startsAt : item.startsAt;
  const endsAt = whole ? item.repeat!.endsAt : item.endsAt;
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  return {
    startDay: start ? dateKey(start) : '',
    startTime: start && !item.allDay ? timeKey(start) : '',
    // All-day events store the midnight after the last day; the form shows the last day.
    endDay: end ? dateKey(item.allDay ? addDays(end, -1) : end) : '',
    endTime: end && !item.allDay ? timeKey(end) : '',
  };
}
function initial(item: CalendarItem | null, draft: CalendarDraft, scope: Scope) {
  if (item) {
    const first = item.repeat ? new Date(item.repeat.startsAt) : null;
    return {
      kind: item.kind,
      title: item.title,
      details: item.details,
      allDay: item.allDay,
      color: item.color,
      ...times(item, scope),
      repeat: item.repeat !== null,
      weekdays: item.repeat?.weekdays ?? [],
      until:
        item.repeat?.until ?? (first ? dateKey(addDays(first, DEFAULT_REPEAT_WEEKS * 7 - 7)) : ''),
    };
  }
  const start = draft.start;
  const end = start ? new Date(start.getTime() + 60 * 60_000) : null;
  return {
    kind: draft.kind,
    title: draft.title ?? '',
    details: '',
    allDay: draft.allDay ?? false,
    color: 'blue' as CalendarColor,
    startDay: start ? dateKey(start) : '',
    startTime: start && !draft.allDay ? timeKey(start) : '',
    endDay: end ? dateKey(draft.allDay ? start! : end) : '',
    endTime: end && !draft.allDay ? timeKey(end) : '',
    repeat: false,
    weekdays: [] as number[],
    until: '',
  };
}

export function CalendarEditor({
  item,
  draft,
  saved,
  deleted,
  cancel,
}: {
  item: CalendarItem | null;
  draft: CalendarDraft;
  saved: (item: CalendarItem) => void;
  deleted: () => void;
  cancel: () => void;
}) {
  const occurrence = item?.occurrenceStart ? item : null;
  const [scope, setScope] = useState<Scope>('one');
  const [form, setForm] = useState(() => initial(item, draft, 'one'));
  // Repeat is set on a whole series or a single item, never on one occurrence.
  const repeatable = form.kind === 'EVENT' && !(occurrence && scope === 'one');
  const link = item
    ? (item.material ?? (item.materialUnavailable ? 'unavailable' : null))
    : (draft.material ?? null);
  // A withheld link keeps its ids server-side; the form can only keep it or drop it.
  const [keepLink, setKeepLink] = useState(link !== null);
  const [pageNumber, setPageNumber] = useState(
    link && link !== 'unavailable' ? String(link.pageNumber) : '',
  );
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const title = useRef<HTMLInputElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((v) => ({ ...v, [key]: value }));
  const startWeekday = (() => {
    const day = fromInputs(form.startDay);
    return day ? isoWeekday(day) : null;
  })();
  function toggleRepeat(on: boolean) {
    setForm((v) => {
      const day = fromInputs(v.startDay);
      return {
        ...v,
        repeat: on,
        weekdays: v.weekdays.length || !day ? v.weekdays : [isoWeekday(day)],
        until: v.until || (day ? dateKey(addDays(day, DEFAULT_REPEAT_WEEKS * 7 - 7)) : ''),
      };
    });
  }

  function build(): CalendarFields | string {
    const text = form.title.trim();
    if (!text) return 'Nhập tiêu đề.';
    let startsAt: string | null = null,
      endsAt: string | null = null,
      repeat: CalendarRepeatInput | null = null;
    if (form.kind === 'EVENT') {
      const start = fromInputs(form.startDay, form.allDay ? '00:00' : form.startTime);
      const last = fromInputs(form.endDay || form.startDay, form.allDay ? '00:00' : form.endTime);
      if (!start || !last) return 'Chọn ngày và giờ bắt đầu, kết thúc.';
      const end = form.allDay ? addDays(last, 1) : last;
      if (end <= start) return 'Giờ kết thúc phải sau giờ bắt đầu.';
      if (end.getTime() - start.getTime() > MAX_EVENT_MS)
        return 'Một lịch học kéo dài tối đa 14 ngày.';
      startsAt = start.toISOString();
      endsAt = end.toISOString();
      if (repeatable && form.repeat) {
        if (!fromInputs(form.until)) return 'Chọn ngày kết thúc lặp.';
        if (form.until < form.startDay) return 'Ngày kết thúc lặp phải từ ngày bắt đầu trở đi.';
        // The first session always repeats, so its weekday is part of the series.
        const weekdays = [...new Set([...form.weekdays, isoWeekday(start)])].sort();
        repeat = { weekdays, until: form.until, utcOffset: utcOffset(start) };
      }
    } else if (form.startDay) {
      const due = fromInputs(form.startDay, form.allDay ? '00:00' : form.startTime || '23:59');
      if (!due) return 'Ngày hạn chưa hợp lệ.';
      startsAt = due.toISOString();
    }
    let versionId: string | null = null,
      page: number | null = null;
    if (keepLink && link) {
      // A withheld link is sent as keepSource; its ids never reach the browser.
      if (link === 'unavailable') return fields(text, startsAt, endsAt, null, null, repeat);
      versionId = link.versionId;
      page = Number(pageNumber);
      if (!Number.isInteger(page) || page < 1) return 'Số trang phải là số nguyên từ 1.';
    }
    return fields(text, startsAt, endsAt, versionId, page, repeat);
  }
  function fields(
    text: string,
    startsAt: string | null,
    endsAt: string | null,
    versionId: string | null,
    page: number | null,
    repeat: CalendarRepeatInput | null,
  ): CalendarFields {
    return {
      kind: form.kind,
      title: text,
      details: form.details.trim(),
      startsAt,
      endsAt,
      allDay: form.kind === 'TASK' && !startsAt ? false : form.allDay,
      color: form.color,
      versionId,
      pageNumber: page,
      repeat,
    };
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const built = build();
    if (typeof built === 'string') {
      setError(built);
      return;
    }
    setBusy(true);
    setError('');
    const keepSource = keepLink && link === 'unavailable';
    try {
      saved(
        occurrence && scope === 'one'
          ? await detachOccurrence(occurrence, built, requestId, keepSource)
          : item
            ? await updateCalendarItem(item, built, keepSource)
            : await createCalendarItem(built, requestId),
      );
    } catch (failure) {
      setError(calendarError(failure));
      setBusy(false);
    }
  }
  async function remove() {
    if (!item) return;
    setBusy(true);
    setError('');
    try {
      if (occurrence && scope === 'one') await skipOccurrence(occurrence);
      else await deleteCalendarItem(item);
      deleted();
    } catch (failure) {
      setError(calendarError(failure));
      setBusy(false);
    }
  }
  const heading = item
    ? item.kind === 'TASK'
      ? 'Sửa việc cần làm'
      : 'Sửa lịch học'
    : form.kind === 'TASK'
      ? 'Thêm việc cần làm'
      : 'Thêm lịch học';
  return (
    <form
      className="calendar-editor"
      aria-labelledby="calendar-editor-title"
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) cancel();
      }}
    >
      <h3 id="calendar-editor-title">{heading}</h3>
      {occurrence && (
        <fieldset className="calendar-kind">
          <legend>Áp dụng cho</legend>
          {(
            [
              ['one', 'Chỉ buổi này'],
              ['all', 'Cả chuỗi'],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="calendar-scope"
                value={value}
                checked={scope === value}
                disabled={busy}
                onChange={() => {
                  setScope(value);
                  setDeleting(false);
                  setForm((v) => ({ ...v, ...times(occurrence, value) }));
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      <fieldset className="calendar-kind">
        <legend>Loại</legend>
        {(
          [
            ['EVENT', 'Lịch học'],
            ['TASK', 'Việc cần làm'],
          ] as const
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="calendar-kind"
              value={value}
              checked={form.kind === value}
              onChange={() => {
                set('kind', value);
                if (value === 'EVENT' && !form.startDay) set('startDay', dateKey(new Date()));
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="form-field">
        <label htmlFor="calendar-title">Tiêu đề</label>
        <input
          id="calendar-title"
          ref={title}
          required
          maxLength={200}
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
        />
      </div>
      <div className="calendar-when">
        <div className="form-field">
          <label htmlFor="calendar-start-day">
            {form.kind === 'TASK' ? 'Ngày hạn' : 'Ngày bắt đầu'}
          </label>
          <input
            id="calendar-start-day"
            type="date"
            required={form.kind === 'EVENT'}
            value={form.startDay}
            onChange={(e) => {
              const next = e.target.value;
              const day = fromInputs(next);
              setForm((v) => ({
                ...v,
                startDay: next,
                // Keep a one-day event on one day when its start moves.
                endDay: !v.endDay || v.endDay === v.startDay ? next : v.endDay,
                // The first session always repeats.
                weekdays:
                  day && !v.weekdays.includes(isoWeekday(day))
                    ? [...v.weekdays, isoWeekday(day)]
                    : v.weekdays,
              }));
            }}
          />
        </div>
        {!form.allDay && (form.kind === 'EVENT' || form.startDay) && (
          <div className="form-field">
            <label htmlFor="calendar-start-time">
              {form.kind === 'TASK' ? 'Giờ hạn' : 'Giờ bắt đầu'}
            </label>
            <input
              id="calendar-start-time"
              type="time"
              required={form.kind === 'EVENT'}
              value={form.startTime}
              onChange={(e) => set('startTime', e.target.value)}
            />
          </div>
        )}
        {form.kind === 'EVENT' && (
          <>
            <div className="form-field">
              <label htmlFor="calendar-end-day">Ngày kết thúc</label>
              <input
                id="calendar-end-day"
                type="date"
                required
                value={form.endDay}
                onChange={(e) => set('endDay', e.target.value)}
              />
            </div>
            {!form.allDay && (
              <div className="form-field">
                <label htmlFor="calendar-end-time">Giờ kết thúc</label>
                <input
                  id="calendar-end-time"
                  type="time"
                  required
                  value={form.endTime}
                  onChange={(e) => set('endTime', e.target.value)}
                />
              </div>
            )}
          </>
        )}
      </div>
      {(form.kind === 'EVENT' || form.startDay) && (
        <label className="calendar-check">
          <input
            type="checkbox"
            checked={form.allDay}
            onChange={(e) => set('allDay', e.target.checked)}
          />
          Cả ngày
        </label>
      )}
      {repeatable && (
        <label className="calendar-check">
          <input
            type="checkbox"
            checked={form.repeat}
            onChange={(e) => toggleRepeat(e.target.checked)}
          />
          Lặp lại hằng tuần
        </label>
      )}
      {repeatable && form.repeat && (
        <div className="calendar-repeat">
          <fieldset className="calendar-weekdays">
            <legend>Lặp vào</legend>
            {weekdayLabels.map((label, index) => {
              const day = index + 1;
              return (
                <label key={label}>
                  <input
                    type="checkbox"
                    checked={day === startWeekday || form.weekdays.includes(day)}
                    // The start date's weekday cannot be dropped; move the start instead.
                    disabled={day === startWeekday}
                    onChange={(e) =>
                      set(
                        'weekdays',
                        e.target.checked
                          ? [...form.weekdays, day]
                          : form.weekdays.filter((d) => d !== day),
                      )
                    }
                  />
                  {label}
                </label>
              );
            })}
          </fieldset>
          <div className="form-field">
            <label htmlFor="calendar-until">Lặp đến ngày</label>
            <input
              id="calendar-until"
              type="date"
              required
              min={form.startDay || undefined}
              value={form.until}
              onChange={(e) => set('until', e.target.value)}
            />
          </div>
          <p className="field-hint">Tối đa 366 ngày. Ngày bắt đầu luôn là buổi đầu của chuỗi.</p>
        </div>
      )}
      {form.kind === 'TASK' && !form.startDay && (
        <p className="field-hint">Để trống ngày hạn để giữ trong danh sách việc chưa có ngày.</p>
      )}
      <fieldset className="calendar-colors">
        <legend>Màu</legend>
        {calendarColors.map((color) => (
          <label key={color} className={`calendar-swatch calendar-color-${color}`}>
            <input
              type="radio"
              name="calendar-color"
              value={color}
              checked={form.color === color}
              onChange={() => set('color', color)}
            />
            <span>{colorLabels[color]}</span>
          </label>
        ))}
      </fieldset>
      <div className="form-field">
        <label htmlFor="calendar-details">Ghi chú</label>
        <textarea
          id="calendar-details"
          rows={3}
          maxLength={2000}
          value={form.details}
          onChange={(e) => set('details', e.target.value)}
        />
      </div>
      {link && keepLink && (
        <div className="calendar-material">
          {link === 'unavailable' ? (
            <p>Tài liệu không còn khả dụng.</p>
          ) : (
            <>
              <p>
                Tài liệu: <Link href={readerHref(link)}>{link.title}</Link>
              </p>
              <div className="form-field">
                <label htmlFor="calendar-page">Trang</label>
                <input
                  id="calendar-page"
                  type="number"
                  min={1}
                  required
                  value={pageNumber}
                  onChange={(e) => setPageNumber(e.target.value)}
                />
              </div>
            </>
          )}
          <button type="button" className="text-button" onClick={() => setKeepLink(false)}>
            Bỏ liên kết tài liệu
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="note-actions">
        <button className="primary-button" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={cancel}>
          Hủy
        </button>
        {item && !deleting && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => setDeleting(true)}
          >
            {occurrence ? (scope === 'one' ? 'Xóa buổi này' : 'Xóa cả chuỗi') : 'Xóa'}
          </button>
        )}
      </div>
      {deleting && (
        <div className="note-delete">
          <p>
            {occurrence && scope === 'one'
              ? `Xóa buổi ${whenLabel(occurrence)} khỏi chuỗi “${occurrence.title}”?`
              : occurrence
                ? `Xóa cả chuỗi “${occurrence.title}” cùng mọi buổi?`
                : `Xóa “${item?.title}”?`}{' '}
            Thao tác không thể hoàn tác.
          </p>
          <div className="note-actions">
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => void remove()}
            >
              Xác nhận xóa
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => setDeleting(false)}
            >
              Giữ lại
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
