'use client';
import Link from 'next/link';
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react';
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
  allDayRemindOptions,
  remindLabel,
  remindOptions,
  skipOccurrence,
  splitOccurrence,
  timeKey,
  truncateOccurrence,
  updateCalendarItem,
  utcOffset,
  weekdayLabels,
  whenLabel,
  type CalendarColor,
  type CalendarFields,
  type CalendarItem,
  type CalendarKind,
  type CalendarRepeatInput,
  type RepeatFreq,
} from '../../lib/calendar';
import { useNotesLeaveGuard } from '../library/use-notes-leave-guard';
import { MaterialPicker } from './material-picker';

/** Asked before leaving the page, or before another item replaces an edited form. */
export const CALENDAR_DRAFT_PROMPT = 'Bạn có mục lịch chưa lưu. Rời trang và bỏ thay đổi?';

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
/**
 * "one": this occurrence only (detach or skip). "following": this occurrence and the later ones
 * (split or truncate). "all": the whole series.
 */
type Scope = 'one' | 'following' | 'all';
const DEFAULT_REPEAT_COUNT = 10;

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
      freq: (item.repeat?.freq ?? 'WEEKLY') as RepeatFreq,
      interval: String(item.repeat?.interval ?? 1),
      weekdays: item.repeat?.weekdays ?? [],
      endBy: (item.repeat?.count ? 'count' : 'until') as 'count' | 'until',
      count: String(item.repeat?.count ?? DEFAULT_REPEAT_COUNT),
      until:
        item.repeat?.until ?? (first ? dateKey(addDays(first, DEFAULT_REPEAT_WEEKS * 7 - 7)) : ''),
      remind: item.reminder ? String(item.reminder.minutes) : '',
      remindMore: (item.reminder?.more ?? []).map(String),
      remindEmail: item.reminder?.email ?? false,
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
    freq: 'WEEKLY' as RepeatFreq,
    interval: '1',
    weekdays: [] as number[],
    endBy: 'until' as 'count' | 'until',
    count: String(DEFAULT_REPEAT_COUNT),
    until: '',
    /** Minutes before, as the select's value; empty is no reminder. */
    remind: '',
    /** Up to two more leads (CAL-07). */
    remindMore: [] as string[],
    remindEmail: false,
  };
}

export function CalendarEditor({
  item,
  draft,
  saved,
  deleted,
  cancel,
  dirtyChanged,
}: {
  item: CalendarItem | null;
  draft: CalendarDraft;
  saved: (item: CalendarItem) => void;
  deleted: () => void;
  cancel: () => void;
  /** Lets the board ask before another open replaces this form. */
  dirtyChanged?: (dirty: boolean) => void;
}) {
  const occurrence = item?.occurrenceStart ? item : null;
  const [scope, setScope] = useState<Scope>('one');
  const [baseline] = useState(() => initial(item, draft, 'one'));
  const [form, setForm] = useState(baseline);
  // Repeat is set on a whole series or a single item, never on one occurrence.
  // A session or a dated task repeats; one occurrence on its own does not.
  const repeatable =
    (form.kind === 'EVENT' || form.startDay !== '') && !(occurrence && scope === 'one');
  // Reminders need a time: a timed session, or a task with a due date that is not all-day.
  // Any item with a date reminds; an all-day one at a time of day (CAL-07).
  const remindable = form.kind === 'EVENT' || form.startDay !== '';
  const leadOptions: readonly number[] = form.allDay ? allDayRemindOptions : remindOptions;
  const original = item
    ? (item.material ?? (item.materialUnavailable ? 'unavailable' : null))
    : (draft.material ?? null);
  /** A document picked in this form; it replaces the stored link. */
  const [chosen, setChosen] = useState<CalendarDraft['material'] | null>(null);
  const [picking, setPicking] = useState(false);
  const link = chosen ?? original;
  // A withheld link keeps its ids server-side; the form can only keep it or drop it.
  const [keepLink, setKeepLink] = useState(original !== null);
  const [pageNumber, setPageNumber] = useState(
    original && original !== 'unavailable' ? String(original.pageNumber) : '',
  );
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  // Switching scope only reloads the dates for that scope; it is not an edit by itself.
  const unchanged = occurrence ? { ...baseline, ...times(occurrence, scope) } : baseline;
  const dirty =
    JSON.stringify(form) !== JSON.stringify(unchanged) ||
    chosen !== null ||
    keepLink !== (original !== null) ||
    pageNumber !== (original && original !== 'unavailable' ? String(original.pageNumber) : '');
  useNotesLeaveGuard(dirty, busy, CALENDAR_DRAFT_PROMPT);
  const reportDirty = useEffectEvent((value: boolean) => dirtyChanged?.(value));
  useEffect(() => reportDirty(dirty), [dirty]);
  useEffect(() => () => reportDirty(false), []);
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
    } else if (form.startDay) {
      const due = fromInputs(form.startDay, form.allDay ? '00:00' : form.startTime || '23:59');
      if (!due) return 'Ngày hạn chưa hợp lệ.';
      startsAt = due.toISOString();
    }
    if (repeatable && form.repeat && startsAt) {
      const start = new Date(startsAt);
      const interval = Number(form.interval);
      if (!Number.isInteger(interval) || interval < 1 || interval > 12)
        return 'Lặp mỗi 1 tới 12 tuần hoặc tháng.';
      let end: { until: string } | { count: number };
      if (form.endBy === 'count') {
        const count = Number(form.count);
        if (!Number.isInteger(count) || count < 1 || count > 400) return 'Số lần lặp từ 1 tới 400.';
        end = { count };
      } else {
        if (!fromInputs(form.until)) return 'Chọn ngày kết thúc lặp.';
        if (form.until < form.startDay) return 'Ngày kết thúc lặp phải từ ngày bắt đầu trở đi.';
        end = { until: form.until };
      }
      // The first occurrence always repeats, so its weekday is part of a weekly series.
      const weekdays =
        form.freq === 'WEEKLY' ? [...new Set([...form.weekdays, isoWeekday(start)])].sort() : [];
      repeat = { freq: form.freq, interval, weekdays, ...end, utcOffset: utcOffset(start) };
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
      remindMinutes: remindable && form.remind ? Number(form.remind) : null,
      remindMore:
        remindable && form.remind
          ? [...new Set(form.remindMore.filter((m) => m !== '' && m !== form.remind))].map(Number)
          : [],
      remindEmail: remindable && form.remind !== '' && form.remindEmail,
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
          : occurrence && scope === 'following'
            ? await splitOccurrence(occurrence, built, requestId, keepSource)
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
      else if (occurrence && scope === 'following') await truncateOccurrence(occurrence);
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
              ['following', 'Buổi này và các buổi sau'],
              ['all', 'Cả chuỗi'],
            ] as const
          )
            // From the first occurrence, "and the following" is the whole series.
            .filter(
              ([value]) =>
                value !== 'following' || occurrence.occurrenceStart !== occurrence.repeat?.startsAt,
            )
            .map(([value, label]) => (
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
                    // A new tail series ends where the old one did, by date.
                    setForm((v) => ({
                      ...v,
                      ...times(occurrence, value),
                      ...(value === 'following' ? { endBy: 'until' as const } : {}),
                    }));
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
            onChange={(e) => {
              const allDay = e.target.checked;
              // Timed and all-day items take different reminders; drop the ones that no longer fit.
              const fits: readonly number[] = allDay ? allDayRemindOptions : remindOptions;
              setForm((v) => {
                const keep = [v.remind, ...v.remindMore].filter(
                  (m) => m !== '' && fits.includes(Number(m)),
                );
                return {
                  ...v,
                  allDay,
                  remind: keep[0] ?? '',
                  remindMore: keep.slice(1),
                  remindEmail: keep.length > 0 && v.remindEmail,
                };
              });
            }}
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
          Lặp lại
        </label>
      )}
      {repeatable && form.repeat && (
        <div className="calendar-repeat">
          <div className="calendar-repeat-rule">
            <div className="form-field">
              <label htmlFor="calendar-freq">Kiểu lặp</label>
              <select
                id="calendar-freq"
                value={form.freq}
                onChange={(e) => set('freq', e.target.value as RepeatFreq)}
              >
                <option value="WEEKLY">Hằng tuần</option>
                <option value="MONTHLY">Hằng tháng (cùng ngày)</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="calendar-interval">
                Mỗi bao nhiêu {form.freq === 'MONTHLY' ? 'tháng' : 'tuần'}
              </label>
              <input
                id="calendar-interval"
                type="number"
                min={1}
                max={12}
                required
                value={form.interval}
                onChange={(e) => set('interval', e.target.value)}
              />
            </div>
          </div>
          {form.freq === 'WEEKLY' && (
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
          )}
          <fieldset className="calendar-kind">
            <legend>Kết thúc</legend>
            <label>
              <input
                type="radio"
                name="calendar-end-by"
                checked={form.endBy === 'until'}
                onChange={() => set('endBy', 'until')}
              />
              Vào ngày
            </label>
            <label>
              <input
                type="radio"
                name="calendar-end-by"
                checked={form.endBy === 'count'}
                onChange={() => set('endBy', 'count')}
              />
              Sau số lần
            </label>
          </fieldset>
          {form.endBy === 'until' ? (
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
          ) : (
            <div className="form-field">
              <label htmlFor="calendar-count">Số lần</label>
              <input
                id="calendar-count"
                type="number"
                min={1}
                max={400}
                required
                value={form.count}
                onChange={(e) => set('count', e.target.value)}
              />
            </div>
          )}
          <p className="field-hint">
            Tối đa 366 ngày. Ngày bắt đầu luôn là lần đầu của chuỗi
            {form.freq === 'MONTHLY' ? '; tháng không có ngày đó thì bỏ qua' : ''}.
          </p>
        </div>
      )}
      {form.kind === 'TASK' && !form.startDay && (
        <p className="field-hint">Để trống ngày hạn để giữ trong danh sách việc chưa có ngày.</p>
      )}
      {remindable && (
        <div className="calendar-remind">
          <div className="form-field">
            <label htmlFor="calendar-remind">Nhắc</label>
            <select
              id="calendar-remind"
              value={leadOptions.includes(Number(form.remind)) ? form.remind : ''}
              onChange={(e) => set('remind', e.target.value)}
            >
              <option value="">Không nhắc</option>
              {leadOptions.map((minutes) => (
                <option key={minutes} value={String(minutes)}>
                  {remindLabel(minutes, form.allDay)}
                </option>
              ))}
            </select>
          </div>
          {form.remind !== '' &&
            form.remindMore.map((value, index) => (
              <div className="form-field calendar-remind-more" key={index}>
                <label htmlFor={`calendar-remind-${index + 2}`}>Nhắc lần {index + 2}</label>
                <select
                  id={`calendar-remind-${index + 2}`}
                  value={leadOptions.includes(Number(value)) ? value : ''}
                  onChange={(e) =>
                    set(
                      'remindMore',
                      form.remindMore.map((v, i) => (i === index ? e.target.value : v)),
                    )
                  }
                >
                  <option value="">Chọn giờ nhắc</option>
                  {leadOptions
                    .filter((m) => String(m) !== form.remind)
                    .map((minutes) => (
                      <option key={minutes} value={String(minutes)}>
                        {remindLabel(minutes, form.allDay)}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="text-button"
                  aria-label={`Bỏ lời nhắc lần ${index + 2}`}
                  onClick={() =>
                    set(
                      'remindMore',
                      form.remindMore.filter((_, i) => i !== index),
                    )
                  }
                >
                  Bỏ
                </button>
              </div>
            ))}
          {form.remind !== '' && form.remindMore.length < 2 && (
            <button
              type="button"
              className="text-button"
              onClick={() => set('remindMore', [...form.remindMore, ''])}
            >
              Thêm lời nhắc
            </button>
          )}
          {form.remind !== '' && (
            <label className="calendar-check">
              <input
                type="checkbox"
                checked={form.remindEmail}
                onChange={(e) => set('remindEmail', e.target.checked)}
              />
              Gửi cả email
            </label>
          )}
          {form.remind !== '' && (
            <p className="field-hint">
              Thông báo hiện ở chuông{form.remindEmail ? ' và gửi tới email tài khoản' : ''}. Thư
              chỉ có tiêu đề, không có ghi chú.
            </p>
          )}
        </div>
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
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setKeepLink(false);
              setChosen(null);
            }}
          >
            Bỏ liên kết tài liệu
          </button>
        </div>
      )}
      {!(link && keepLink) &&
        (picking ? (
          <MaterialPicker
            cancel={() => setPicking(false)}
            pick={(found) => {
              setChosen({ versionId: found.versionId, pageNumber: 1, title: found.title });
              setKeepLink(true);
              setPageNumber('1');
              setPicking(false);
            }}
          />
        ) : (
          <button type="button" className="text-button" onClick={() => setPicking(true)}>
            Gắn tài liệu
          </button>
        ))}
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
            {occurrence
              ? scope === 'one'
                ? 'Xóa buổi này'
                : scope === 'following'
                  ? 'Xóa buổi này và các buổi sau'
                  : 'Xóa cả chuỗi'
              : 'Xóa'}
          </button>
        )}
      </div>
      {deleting && (
        <div className="note-delete">
          <p>
            {occurrence && scope === 'one'
              ? `Xóa buổi ${whenLabel(occurrence)} khỏi chuỗi “${occurrence.title}”?`
              : occurrence && scope === 'following'
                ? `Xóa buổi ${whenLabel(occurrence)} và mọi buổi sau đó của “${occurrence.title}”?`
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
