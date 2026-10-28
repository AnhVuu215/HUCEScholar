'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  addDays,
  calendarError,
  calendarRange,
  createCalendarItem,
  dateKey,
  detachOccurrence,
  droppedTimes,
  resizedTimes,
  formatDay,
  formatLongDay,
  formatTime,
  itemFields,
  itemKey,
  itemSpan,
  onDay,
  openTasks,
  overdue,
  readerHref,
  remindLabel,
  repeatLabel,
  sameDay,
  setCalendarDone,
  startOfDay,
  startOfWeek,
  updateCalendarItem,
  weekdayLabels,
  whenLabel,
  DAY_MS,
  type CalendarFields,
  type CalendarItem,
  type CalendarRange,
  type CalendarTasks,
} from '../../lib/calendar';
import { readingDeadlines, type ReadingDeadline } from '../../lib/reading-lists';
import { CalendarEditor, type CalendarDraft } from './calendar-editor';
import { ReviewLaterPanel } from './review-later-panel';

type View = 'week' | 'month' | 'agenda';
const views: [View, string, string][] = [
  ['week', 'Tuần', 'W'],
  ['month', 'Tháng', 'M'],
  ['agenda', 'Lịch biểu', 'A'],
];
const AGENDA_DAYS = 30;
const HOUR_PX = 48;
const MONTH_CHIPS = 3;

function bounds(view: View, anchor: Date) {
  if (view === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 7) };
  }
  if (view === 'month') {
    const from = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    return { from, to: addDays(from, 42) };
  }
  const from = startOfDay(anchor);
  return { from, to: addDays(from, AGENDA_DAYS) };
}
function heading(view: View, anchor: Date) {
  if (view === 'month') return `Tháng ${anchor.getMonth() + 1}, ${anchor.getFullYear()}`;
  const { from, to } = bounds(view, anchor);
  const last = addDays(to, -1);
  return view === 'week'
    ? `${from.getDate()}/${from.getMonth() + 1} – ${formatLongDay(last).split(', ')[1]}`
    : `Từ ${formatLongDay(from)}`;
}
function shift(view: View, anchor: Date, step: number) {
  if (view === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + step, 1);
  return addDays(anchor, step * 7);
}
/** A new session: the next whole hour today, or 8:00 on another day in view. */
function sessionStart(anchor: Date, now: Date) {
  const start = new Date(anchor);
  start.setHours(sameDay(anchor, now) ? Math.min(now.getHours() + 1, 23) : 8);
  return start;
}
/** CAL-02 shortcuts; ignored while typing or inside a form, and with Ctrl/Alt/⌘. */
const SHORTCUT_HINT =
  'Phím tắt: T hôm nay · W tuần · M tháng · A lịch biểu · ← → chuyển khoảng · N thêm lịch học. Kéo thả bằng chuột: dời lịch học, kéo cạnh dưới để đổi thời lượng, kéo việc lên lịch để đặt hạn hoặc về panel để bỏ ngày.';
const titleOf = (item: CalendarItem) =>
  `${item.title} · ${whenLabel(item)}${item.repeat ? ` · ${repeatLabel(item.repeat)}` : ''}${
    item.reminder ? ` · Nhắc: ${remindLabel(item.reminder.minutes).toLowerCase()}` : ''
  }`;
/**
 * What is being dragged. `move`: the whole item, held `grabMinutes` below its start on the hour
 * grid. `resize`: the bottom edge of a timed session.
 */
type Drag = {
  item: CalendarItem;
  grabMinutes: number;
  mode: 'move' | 'resize';
  /** Dropping a task back where it came from must not clear its date. */
  fromPanel: boolean;
};
type Times = Pick<CalendarFields, 'startsAt' | 'endsAt' | 'allDay'>;
/** Timed events split per day; all-day events and tasks go to the strip above the hours. */
const timed = (item: CalendarItem) => item.kind === 'EVENT' && !item.allDay;
/** Side-by-side lanes for overlapping sessions within one day, like Google Calendar. */
function lanes(items: CalendarItem[], day: Date) {
  const next = addDays(day, 1);
  const segments = items
    .filter((i) => timed(i) && onDay(i, day))
    .map((item) => {
      const { start, end } = itemSpan(item);
      return {
        item,
        start: Math.max(start.getTime(), day.getTime()),
        end: Math.min(end.getTime(), next.getTime()),
        lane: 0,
        lanes: 1,
      };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: typeof segments = [],
    ends: number[] = [],
    clusterEnd = -Infinity;
  const close = () => {
    for (const s of cluster) s.lanes = ends.length;
    cluster = [];
    ends = [];
  };
  for (const s of segments) {
    if (s.start >= clusterEnd) close();
    let lane = ends.findIndex((end) => end <= s.start);
    if (lane < 0) lane = ends.push(s.end) - 1;
    else ends[lane] = s.end;
    s.lane = lane;
    cluster.push(s);
    clusterEnd = Math.max(clusterEnd, s.end);
  }
  close();
  return segments;
}

/** CAL-04c: the name says when the reader has already marked the item read. */
const deadlineLabel = (d: ReadingDeadline) => `Hạn đọc: ${d.title}${d.read ? ' · Đã đọc' : ''}`;
/** CAL-04b: a lecturer's due date on a followed course's reading list; read-only here. */
function Deadline({ deadline }: { deadline: ReadingDeadline }) {
  const label = deadlineLabel(deadline);
  return (
    <div className={`calendar-chip calendar-deadline${deadline.read ? ' is-done' : ''}`}>
      <Link
        href={`/workspace/library/versions/${deadline.versionId}`}
        title={`${label} · ${deadline.course.code} · ${deadline.listTitle}${
          deadline.section ? ` · ${deadline.section}` : ''
        }`}
      >
        {label}
      </Link>
    </div>
  );
}
const deadlinesOn = (deadlines: ReadingDeadline[], day: Date) => {
  const key = dateKey(day);
  return deadlines.filter((d) => d.dueOn === key);
};

function TaskCheck({
  item,
  toggle,
  busy,
}: {
  item: CalendarItem;
  toggle: (item: CalendarItem, done: boolean) => void;
  busy: boolean;
}) {
  return (
    <input
      type="checkbox"
      className="calendar-task-check"
      aria-label={`Hoàn thành: ${item.title}`}
      checked={item.done}
      disabled={busy}
      onChange={(e) => toggle(item, e.target.checked)}
    />
  );
}
function Chip({
  item,
  open,
  toggle,
  busy,
  drag,
  showTime = true,
}: {
  item: CalendarItem;
  open: (item: CalendarItem) => void;
  toggle: (item: CalendarItem, done: boolean) => void;
  busy: boolean;
  drag: (event: DragEvent, item: CalendarItem) => void;
  showTime?: boolean;
}) {
  const start = item.startsAt ? new Date(item.startsAt) : null;
  return (
    <div
      className={`calendar-chip calendar-color-${item.color}${item.done ? ' is-done' : ''}`}
      draggable={!busy}
      onDragStart={(e) => drag(e, item)}
    >
      {item.kind === 'TASK' && <TaskCheck item={item} toggle={toggle} busy={busy} />}
      <button type="button" onClick={() => open(item)} title={titleOf(item)}>
        {showTime && start && !item.allDay && <span>{formatTime(start)} </span>}
        {item.title}
      </button>
    </div>
  );
}

export function CalendarBoard() {
  const [view, setView] = useState<View>('week');
  // A reminder links here with ?at=<instant>; the day is placed in this device's time zone.
  const at = Date.parse(useSearchParams().get('at') ?? '');
  const [anchor, setAnchor] = useState(() =>
    startOfDay(Number.isNaN(at) ? new Date() : new Date(at)),
  );
  const [range, setRange] = useState<CalendarRange | null>(null);
  const [tasks, setTasks] = useState<CalendarTasks | null>(null);
  const [deadlines, setDeadlines] = useState<ReadingDeadline[]>([]);
  const [deadlineError, setDeadlineError] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<{
    item: CalendarItem | null;
    draft: CalendarDraft;
    /** Remounts the form for every open, so a second "new" starts clean. */
    seq: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [quick, setQuick] = useState('');
  const [quickId, setQuickId] = useState(() => crypto.randomUUID());
  const [now, setNow] = useState(() => new Date());
  const hours = useRef<HTMLDivElement>(null);
  const dragging = useRef<Drag | null>(null);
  /** Day (ms) or 'tasks' under the pointer while dragging, for the dashed outline. */
  const [dropTarget, setDropTarget] = useState<number | 'tasks' | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const { from, to } = useMemo(() => bounds(view, anchor), [view, anchor]);
  const loaded = range !== null;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([calendarRange(from, to, controller.signal), openTasks(controller.signal)])
      .then(([nextRange, nextTasks]) => {
        if (controller.signal.aborted) return;
        setRange(nextRange);
        setTasks(nextTasks);
        setError('');
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(calendarError(failure));
      });
    return () => controller.abort();
  }, [from, to, attempt]);
  // Reading-list due dates load on their own, so a failure there leaves the calendar usable.
  useEffect(() => {
    const controller = new AbortController();
    readingDeadlines(dateKey(from), dateKey(to), controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setDeadlines(result.items);
        setDeadlineError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setDeadlineError(true);
      });
    return () => controller.abort();
  }, [from, to, attempt]);
  // Start the hour grid at 7:00, where most study days begin.
  useEffect(() => {
    if (view === 'week' && hours.current) hours.current.scrollTop = 7 * HOUR_PX;
  }, [view, loaded]);
  useEffect(() => {
    if (editor) editorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [editor]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.isComposing) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, form, [contenteditable="true"]')) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === 't') setAnchor(startOfDay(new Date()));
      else if (key === 'w') setView('week');
      else if (key === 'm') setView('month');
      else if (key === 'a') setView('agenda');
      else if (key === 'ArrowLeft') setAnchor((v) => shift(view, v, -1));
      else if (key === 'ArrowRight') setAnchor((v) => shift(view, v, 1));
      else if (key === 'n') {
        setNotice('');
        setEditor((v) => ({
          item: null,
          draft: { kind: 'EVENT', start: sessionStart(anchor, new Date()) },
          seq: (v?.seq ?? 0) + 1,
        }));
      } else return;
      event.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, anchor]);

  const reload = () => setAttempt((v) => v + 1);
  function open(item: CalendarItem) {
    setNotice('');
    setEditor((v) => ({ item, draft: { kind: item.kind, start: null }, seq: (v?.seq ?? 0) + 1 }));
  }
  function create(draft: CalendarDraft) {
    setNotice('');
    setEditor((v) => ({ item: null, draft, seq: (v?.seq ?? 0) + 1 }));
  }
  /** Ticks show at once; a failed request reloads to put the box back as the server has it. */
  function mark(id: string, done: boolean) {
    const apply = <T extends { items: CalendarItem[] }>(v: T | null) =>
      v && { ...v, items: v.items.map((i) => (i.id === id ? { ...i, done } : i)) };
    setRange(apply);
    setTasks(apply);
  }
  async function toggle(item: CalendarItem, done: boolean) {
    setBusy(true);
    setError('');
    mark(item.id, done);
    try {
      await setCalendarDone(item, done);
      setNotice(done ? `Đã xong: ${item.title}` : `Mở lại: ${item.title}`);
      reload();
    } catch (failure) {
      setError(calendarError(failure));
      reload();
    } finally {
      setBusy(false);
    }
  }
  function startDrag(
    event: DragEvent,
    item: CalendarItem,
    grabMinutes = 0,
    mode: Drag['mode'] = 'move',
    fromPanel = false,
  ) {
    // A resize handle sits inside a draggable session; only the handle starts this drag.
    event.stopPropagation();
    dragging.current = { item, grabMinutes, mode, fromPanel };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.title);
  }
  function endDrag() {
    dragging.current = null;
    setDropTarget(null);
  }
  /** Drop target for a day; on the hour grid the pointer height picks the time. */
  function dropZone(day: Date, grid: boolean) {
    return {
      onDragOver(event: DragEvent<HTMLElement>) {
        // A bottom edge only lands on the hour grid.
        if (!dragging.current || (dragging.current.mode === 'resize' && !grid)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (dropTarget !== day.getTime()) setDropTarget(day.getTime());
      },
      onDrop(event: DragEvent<HTMLElement>) {
        event.preventDefault();
        event.stopPropagation();
        const held = dragging.current;
        endDrag();
        if (!held) return;
        const pointer =
          ((event.clientY - event.currentTarget.getBoundingClientRect().top) / HOUR_PX) * 60;
        if (held.mode === 'resize') {
          if (grid) void save(held.item, resizedTimes(held.item, day, pointer), 'Đã đổi giờ');
        } else
          void save(
            held.item,
            droppedTimes(held.item, day, grid ? pointer - held.grabMinutes : null),
            'Đã dời',
          );
      },
    };
  }
  /** The task panel takes a dated task back and clears its date. */
  const unschedule = {
    onDragOver(event: DragEvent<HTMLElement>) {
      const held = dragging.current;
      if (!held || held.mode !== 'move' || held.fromPanel) return;
      if (held.item.kind !== 'TASK' || !held.item.startsAt) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (dropTarget !== 'tasks') setDropTarget('tasks');
    },
    onDrop(event: DragEvent<HTMLElement>) {
      event.preventDefault();
      const held = dragging.current;
      endDrag();
      if (held && !held.fromPanel && held.item.kind === 'TASK' && held.item.startsAt)
        void save(held.item, { startsAt: null, endsAt: null, allDay: false }, 'Đã bỏ ngày');
    },
  };
  /** Saves a drop. One session of a series leaves it, like "Chỉ buổi này". */
  async function save(item: CalendarItem, times: Times | null, verb: string) {
    if (!times) return;
    const { fields, keepSource } = itemFields(item);
    setBusy(true);
    setError('');
    try {
      if (item.occurrenceStart)
        await detachOccurrence(item, { ...fields, ...times }, crypto.randomUUID(), keepSource);
      else await updateCalendarItem(item, { ...fields, ...times }, keepSource);
      setNotice(`${verb}: ${item.title}${item.occurrenceStart ? ' (chỉ buổi này)' : ''}`);
    } catch (failure) {
      setError(calendarError(failure));
    } finally {
      setBusy(false);
      reload();
    }
  }
  async function quickAdd(event: FormEvent) {
    event.preventDefault();
    const title = quick.trim();
    if (!title) return;
    setBusy(true);
    setError('');
    try {
      await createCalendarItem(
        {
          kind: 'TASK',
          title,
          details: '',
          startsAt: null,
          endsAt: null,
          allDay: false,
          color: 'blue',
          versionId: null,
          pageNumber: null,
        },
        quickId,
      );
      setQuick('');
      setQuickId(crypto.randomUUID());
      setNotice(`Đã thêm việc: ${title}`);
      reload();
    } catch (failure) {
      setError(calendarError(failure));
    } finally {
      setBusy(false);
    }
  }
  const days = Array.from(
    { length: Math.round((to.getTime() - from.getTime()) / DAY_MS) },
    (_, i) => addDays(from, i),
  );
  const items = range?.items ?? [];
  const today = startOfDay(now);
  const chip = (item: CalendarItem, showTime = true) => (
    <Chip
      key={itemKey(item)}
      item={item}
      open={open}
      toggle={toggle}
      busy={busy}
      drag={startDrag}
      showTime={showTime}
    />
  );
  const dropClass = (day: Date) => (dropTarget === day.getTime() ? ' is-drop-target' : '');

  return (
    <div className="calendar-layout" onDragEnd={endDrag}>
      <section className="calendar-main" aria-labelledby="calendar-heading">
        <div className="calendar-toolbar">
          <button
            type="button"
            className="secondary-button"
            aria-keyshortcuts="T"
            onClick={() => setAnchor(startOfDay(new Date()))}
          >
            Hôm nay
          </button>
          <button
            type="button"
            className="secondary-button calendar-step"
            aria-label="Khoảng trước"
            aria-keyshortcuts="ArrowLeft"
            onClick={() => setAnchor((v) => shift(view, v, -1))}
          >
            ‹
          </button>
          <button
            type="button"
            className="secondary-button calendar-step"
            aria-label="Khoảng sau"
            aria-keyshortcuts="ArrowRight"
            onClick={() => setAnchor((v) => shift(view, v, 1))}
          >
            ›
          </button>
          <h2 id="calendar-heading" aria-live="polite">
            {heading(view, anchor)}
          </h2>
          <div className="calendar-views" role="group" aria-label="Chế độ xem">
            {views.map(([value, label, shortcut]) => (
              <button
                key={value}
                type="button"
                className="secondary-button"
                aria-pressed={view === value}
                aria-keyshortcuts={shortcut}
                onClick={() => setView(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="primary-button"
            aria-keyshortcuts="N"
            onClick={() => create({ kind: 'EVENT', start: sessionStart(anchor, new Date()) })}
          >
            Thêm lịch học
          </button>
        </div>
        <p className="field-hint calendar-shortcuts">{SHORTCUT_HINT}</p>
        {notice && (
          <p role="status" className="field-hint">
            {notice}
          </p>
        )}
        {error && (
          <div className="users-list-message">
            <p role="alert" className="form-error">
              {error}
            </p>
            <button type="button" className="secondary-button" onClick={reload}>
              Tải lại lịch
            </button>
          </div>
        )}
        {editor && (
          <div ref={editorRef}>
            <CalendarEditor
              key={editor.seq}
              item={editor.item}
              draft={editor.draft}
              cancel={() => setEditor(null)}
              saved={(item) => {
                setEditor(null);
                setNotice(`Đã lưu: ${item.title}`);
                reload();
              }}
              deleted={() => {
                setEditor(null);
                setNotice('Đã xóa mục lịch.');
                reload();
              }}
            />
          </div>
        )}
        {deadlineError && (
          <p className="field-hint" role="status">
            Chưa tải được hạn danh sách đọc.{' '}
            <button type="button" className="text-button" onClick={reload}>
              Thử lại
            </button>
          </p>
        )}
        {range?.truncated && (
          <p className="field-hint">Khoảng này có quá nhiều mục; chỉ hiện 500 mục đầu.</p>
        )}
        {!range && !error ? (
          <p role="status">Đang tải lịch…</p>
        ) : view === 'week' ? (
          <div className="calendar-week">
            <div className="calendar-week-head">
              <span />
              {days.map((day) => (
                <div key={day.getTime()} className={sameDay(day, today) ? 'is-today' : undefined}>
                  <span>{weekdayLabels[(day.getDay() + 6) % 7]}</span>
                  <strong>{day.getDate()}</strong>
                </div>
              ))}
            </div>
            <div className="calendar-week-strip">
              <span>Cả ngày</span>
              {days.map((day) => (
                <div
                  key={day.getTime()}
                  className={dropClass(day).trim() || undefined}
                  {...dropZone(day, false)}
                >
                  {deadlinesOn(deadlines, day).map((d) => (
                    <Deadline key={`${d.listId}-${d.position}`} deadline={d} />
                  ))}
                  {items.filter((i) => !timed(i) && onDay(i, day)).map((i) => chip(i))}
                </div>
              ))}
            </div>
            <div className="calendar-hours" ref={hours}>
              <div className="calendar-hour-labels" aria-hidden="true">
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h}>{h === 0 ? '' : `${h}:00`}</span>
                ))}
              </div>
              {days.map((day) => (
                <div
                  key={day.getTime()}
                  className={`calendar-day-column${dropClass(day)}`}
                  aria-label={formatDay(day)}
                  {...dropZone(day, true)}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const minutes = (e.nativeEvent.offsetY / HOUR_PX) * 60;
                    const start = new Date(day);
                    start.setMinutes(Math.floor(minutes / 30) * 30);
                    create({ kind: 'EVENT', start });
                  }}
                >
                  {lanes(items, day).map((s) => (
                    <button
                      key={itemKey(s.item)}
                      type="button"
                      className={`calendar-session calendar-color-${s.item.color}`}
                      title={titleOf(s.item)}
                      draggable={!busy}
                      onDragStart={(e) =>
                        startDrag(
                          e,
                          s.item,
                          ((e.clientY - e.currentTarget.getBoundingClientRect().top) / HOUR_PX) *
                            60 +
                            (s.start - itemSpan(s.item).start.getTime()) / 60_000,
                        )
                      }
                      style={{
                        top: ((s.start - day.getTime()) / 3_600_000) * HOUR_PX,
                        height: Math.max(((s.end - s.start) / 3_600_000) * HOUR_PX - 2, 20),
                        left: `${(s.lane / s.lanes) * 100}%`,
                        width: `calc(${100 / s.lanes}% - 2px)`,
                      }}
                      onClick={() => open(s.item)}
                    >
                      <strong>
                        {s.item.repeat && <span aria-hidden="true">↻ </span>}
                        {s.item.title}
                      </strong>
                      <span>{whenLabel(s.item).split(' · ')[1] ?? whenLabel(s.item)}</span>
                      {s.item.material && <span>Trang {s.item.material.pageNumber}</span>}
                      {/* Only the segment that holds the real end can stretch it. */}
                      {s.end === itemSpan(s.item).end.getTime() && (
                        <span
                          className="calendar-resize"
                          aria-hidden="true"
                          title="Kéo để đổi giờ kết thúc"
                          draggable={!busy}
                          onClick={(e) => e.stopPropagation()}
                          onDragStart={(e) => startDrag(e, s.item, 0, 'resize')}
                        />
                      )}
                    </button>
                  ))}
                  {sameDay(day, today) && (
                    <span
                      className="calendar-now"
                      aria-hidden="true"
                      style={{ top: ((now.getTime() - day.getTime()) / 3_600_000) * HOUR_PX }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : view === 'month' ? (
          <div className="calendar-month">
            {weekdayLabels.map((label) => (
              <span key={label} className="calendar-month-label">
                {label}
              </span>
            ))}
            {days.map((day) => {
              const list = items.filter((i) => onDay(i, day));
              const due = deadlinesOn(deadlines, day);
              const hidden = list.length + due.length - MONTH_CHIPS;
              const outside = day.getMonth() !== anchor.getMonth();
              return (
                <div
                  key={day.getTime()}
                  className={`calendar-month-cell${outside ? ' is-outside' : ''}${sameDay(day, today) ? ' is-today' : ''}${dropClass(day)}`}
                  {...dropZone(day, false)}
                >
                  <button
                    type="button"
                    className="calendar-month-day"
                    aria-label={`Xem tuần có ${formatLongDay(day)}`}
                    onClick={() => {
                      setAnchor(day);
                      setView('week');
                    }}
                  >
                    {day.getDate()}
                  </button>
                  {due.slice(0, MONTH_CHIPS).map((d) => (
                    <Deadline key={`${d.listId}-${d.position}`} deadline={d} />
                  ))}
                  {list.slice(0, Math.max(MONTH_CHIPS - due.length, 0)).map((i) => chip(i))}
                  {hidden > 0 && (
                    <button
                      type="button"
                      className="text-button calendar-more"
                      onClick={() => {
                        setAnchor(day);
                        setView('agenda');
                      }}
                    >
                      +{hidden} mục nữa
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="calendar-agenda">
            {days.every(
              (day) => !items.some((i) => onDay(i, day)) && !deadlinesOn(deadlines, day).length,
            ) ? (
              <p className="users-list-message">
                Không có lịch trong {AGENDA_DAYS} ngày tính từ {formatLongDay(from)}.
              </p>
            ) : (
              days.map((day) => {
                const list = items.filter((i) => onDay(i, day));
                const due = deadlinesOn(deadlines, day);
                if (!list.length && !due.length) return null;
                return (
                  <section key={day.getTime()} aria-label={formatLongDay(day)}>
                    <h3 className={sameDay(day, today) ? 'is-today' : undefined}>
                      {formatLongDay(day)}
                      {sameDay(day, today) ? ' · Hôm nay' : ''}
                    </h3>
                    <ul>
                      {due.map((d) => (
                        <li
                          key={`${d.listId}-${d.position}`}
                          className={`calendar-deadline${d.read ? ' is-done' : ''}`}
                        >
                          <Link href={`/workspace/library/versions/${d.versionId}`}>
                            {deadlineLabel(d)}
                          </Link>
                          <span className="field-hint">
                            {d.course.code} · {d.listTitle}
                            {d.section ? ` · ${d.section}` : ''}
                          </span>
                          <Link
                            href={`/workspace/library/reading-lists?courseId=${encodeURIComponent(d.course.id)}`}
                          >
                            Xem danh sách đọc
                          </Link>
                        </li>
                      ))}
                      {list.map((i) => (
                        <li
                          key={itemKey(i)}
                          className={`calendar-color-${i.color}${i.done ? ' is-done' : ''}`}
                        >
                          {i.kind === 'TASK' && <TaskCheck item={i} toggle={toggle} busy={busy} />}
                          <button type="button" className="text-button" onClick={() => open(i)}>
                            {i.title}
                          </button>
                          <span className="field-hint">{whenLabel(i)}</span>
                          {i.repeat && <span className="field-hint">{repeatLabel(i.repeat)}</span>}
                          {i.reminder && (
                            <span className="field-hint">
                              Nhắc: {remindLabel(i.reminder.minutes).toLowerCase()}
                              {i.reminder.email ? ' · có email' : ''}
                            </span>
                          )}
                          {i.material ? (
                            <Link href={readerHref(i.material)}>
                              Mở {i.material.title} · trang {i.material.pageNumber}
                            </Link>
                          ) : (
                            i.materialUnavailable && (
                              <span className="field-hint">Tài liệu không còn khả dụng</span>
                            )
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })
            )}
          </div>
        )}
      </section>
      <div className="calendar-side">
        <aside
          className={`calendar-tasks${dropTarget === 'tasks' ? ' is-drop-target' : ''}`}
          aria-labelledby="calendar-tasks-title"
          {...unschedule}
        >
          <h2 id="calendar-tasks-title">Việc cần làm</h2>
          <form className="calendar-quick" onSubmit={quickAdd}>
            <label htmlFor="calendar-quick">Thêm việc nhanh</label>
            <div>
              <input
                id="calendar-quick"
                maxLength={200}
                placeholder="Ví dụ: Ôn chương 3"
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
              />
              <button className="secondary-button" disabled={busy || !quick.trim()}>
                Thêm
              </button>
            </div>
            <p className="field-hint">
              Việc mới chưa có ngày; mở việc hoặc kéo việc lên lịch để đặt hạn.
            </p>
          </form>
          {!tasks ? (
            !error && <p role="status">Đang tải việc cần làm…</p>
          ) : tasks.items.length === 0 ? (
            <p className="field-hint">Không còn việc nào chưa xong.</p>
          ) : (
            <ul className="calendar-task-list">
              {tasks.items.map((task) => (
                <li
                  key={task.id}
                  className={`calendar-color-${task.color}`}
                  draggable={!busy}
                  onDragStart={(e) => startDrag(e, task, 0, 'move', true)}
                >
                  <TaskCheck item={task} toggle={toggle} busy={busy} />
                  <div>
                    <button type="button" className="text-button" onClick={() => open(task)}>
                      {task.title}
                    </button>
                    <span className={overdue(task, now) ? 'calendar-overdue' : 'field-hint'}>
                      {overdue(task, now) ? 'Quá hạn · ' : ''}
                      {whenLabel(task)}
                    </span>
                    {task.reminder && (
                      <span className="field-hint">
                        Nhắc: {remindLabel(task.reminder.minutes).toLowerCase()}
                      </span>
                    )}
                    {task.material && (
                      <Link href={readerHref(task.material)}>Trang {task.material.pageNumber}</Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {tasks && tasks.total > tasks.items.length && (
            <p className="field-hint">Còn {tasks.total - tasks.items.length} việc chưa hiện.</p>
          )}
        </aside>
        <ReviewLaterPanel onScheduled={reload} />
      </div>
    </div>
  );
}
