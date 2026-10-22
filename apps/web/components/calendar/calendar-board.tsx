'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  addDays,
  calendarError,
  calendarRange,
  createCalendarItem,
  formatDay,
  formatLongDay,
  formatTime,
  itemSpan,
  onDay,
  openTasks,
  overdue,
  readerHref,
  sameDay,
  setCalendarDone,
  startOfDay,
  startOfWeek,
  weekdayLabels,
  whenLabel,
  DAY_MS,
  type CalendarItem,
  type CalendarRange,
  type CalendarTasks,
} from '../../lib/calendar';
import { CalendarEditor, type CalendarDraft } from './calendar-editor';

type View = 'week' | 'month' | 'agenda';
const views: [View, string][] = [
  ['week', 'Tuần'],
  ['month', 'Tháng'],
  ['agenda', 'Lịch biểu'],
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
  showTime = true,
}: {
  item: CalendarItem;
  open: (item: CalendarItem) => void;
  toggle: (item: CalendarItem, done: boolean) => void;
  busy: boolean;
  showTime?: boolean;
}) {
  const start = item.startsAt ? new Date(item.startsAt) : null;
  return (
    <div className={`calendar-chip calendar-color-${item.color}${item.done ? ' is-done' : ''}`}>
      {item.kind === 'TASK' && <TaskCheck item={item} toggle={toggle} busy={busy} />}
      <button type="button" onClick={() => open(item)} title={`${item.title} · ${whenLabel(item)}`}>
        {showTime && start && !item.allDay && <span>{formatTime(start)} </span>}
        {item.title}
      </button>
    </div>
  );
}

export function CalendarBoard() {
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [range, setRange] = useState<CalendarRange | null>(null);
  const [tasks, setTasks] = useState<CalendarTasks | null>(null);
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
  // Start the hour grid at 7:00, where most study days begin.
  useEffect(() => {
    if (view === 'week' && hours.current) hours.current.scrollTop = 7 * HOUR_PX;
  }, [view, loaded]);
  useEffect(() => {
    if (editor) editorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [editor]);

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
    <Chip key={item.id} item={item} open={open} toggle={toggle} busy={busy} showTime={showTime} />
  );

  return (
    <div className="calendar-layout">
      <section className="calendar-main" aria-labelledby="calendar-heading">
        <div className="calendar-toolbar">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setAnchor(startOfDay(new Date()))}
          >
            Hôm nay
          </button>
          <button
            type="button"
            className="secondary-button calendar-step"
            aria-label="Khoảng trước"
            onClick={() => setAnchor((v) => shift(view, v, -1))}
          >
            ‹
          </button>
          <button
            type="button"
            className="secondary-button calendar-step"
            aria-label="Khoảng sau"
            onClick={() => setAnchor((v) => shift(view, v, 1))}
          >
            ›
          </button>
          <h2 id="calendar-heading" aria-live="polite">
            {heading(view, anchor)}
          </h2>
          <div className="calendar-views" role="group" aria-label="Chế độ xem">
            {views.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="secondary-button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              // Today: the next whole hour. Another day in view: 8:00 that day.
              const start = new Date(anchor);
              start.setHours(sameDay(anchor, today) ? Math.min(now.getHours() + 1, 23) : 8);
              create({ kind: 'EVENT', start });
            }}
          >
            Thêm lịch học
          </button>
        </div>
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
                <div key={day.getTime()}>
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
                  className="calendar-day-column"
                  aria-label={formatDay(day)}
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
                      key={s.item.id}
                      type="button"
                      className={`calendar-session calendar-color-${s.item.color}`}
                      style={{
                        top: ((s.start - day.getTime()) / 3_600_000) * HOUR_PX,
                        height: Math.max(((s.end - s.start) / 3_600_000) * HOUR_PX - 2, 20),
                        left: `${(s.lane / s.lanes) * 100}%`,
                        width: `calc(${100 / s.lanes}% - 2px)`,
                      }}
                      onClick={() => open(s.item)}
                    >
                      <strong>{s.item.title}</strong>
                      <span>{whenLabel(s.item).split(' · ')[1] ?? whenLabel(s.item)}</span>
                      {s.item.material && <span>Trang {s.item.material.pageNumber}</span>}
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
              const outside = day.getMonth() !== anchor.getMonth();
              return (
                <div
                  key={day.getTime()}
                  className={`calendar-month-cell${outside ? ' is-outside' : ''}${sameDay(day, today) ? ' is-today' : ''}`}
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
                  {list.slice(0, MONTH_CHIPS).map((i) => chip(i))}
                  {list.length > MONTH_CHIPS && (
                    <button
                      type="button"
                      className="text-button calendar-more"
                      onClick={() => {
                        setAnchor(day);
                        setView('agenda');
                      }}
                    >
                      +{list.length - MONTH_CHIPS} mục nữa
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="calendar-agenda">
            {days.every((day) => !items.some((i) => onDay(i, day))) ? (
              <p className="users-list-message">
                Không có lịch trong {AGENDA_DAYS} ngày tính từ {formatLongDay(from)}.
              </p>
            ) : (
              days.map((day) => {
                const list = items.filter((i) => onDay(i, day));
                if (!list.length) return null;
                return (
                  <section key={day.getTime()} aria-label={formatLongDay(day)}>
                    <h3 className={sameDay(day, today) ? 'is-today' : undefined}>
                      {formatLongDay(day)}
                      {sameDay(day, today) ? ' · Hôm nay' : ''}
                    </h3>
                    <ul>
                      {list.map((i) => (
                        <li
                          key={i.id}
                          className={`calendar-color-${i.color}${i.done ? ' is-done' : ''}`}
                        >
                          {i.kind === 'TASK' && <TaskCheck item={i} toggle={toggle} busy={busy} />}
                          <button type="button" className="text-button" onClick={() => open(i)}>
                            {i.title}
                          </button>
                          <span className="field-hint">{whenLabel(i)}</span>
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
      <aside className="calendar-tasks" aria-labelledby="calendar-tasks-title">
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
          <p className="field-hint">Việc mới chưa có ngày; mở việc để đặt hạn.</p>
        </form>
        {!tasks ? (
          !error && <p role="status">Đang tải việc cần làm…</p>
        ) : tasks.items.length === 0 ? (
          <p className="field-hint">Không còn việc nào chưa xong.</p>
        ) : (
          <ul className="calendar-task-list">
            {tasks.items.map((task) => (
              <li key={task.id} className={`calendar-color-${task.color}`}>
                <TaskCheck item={task} toggle={toggle} busy={busy} />
                <div>
                  <button type="button" className="text-button" onClick={() => open(task)}>
                    {task.title}
                  </button>
                  <span className={overdue(task, now) ? 'calendar-overdue' : 'field-hint'}>
                    {overdue(task, now) ? 'Quá hạn · ' : ''}
                    {whenLabel(task)}
                  </span>
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
    </div>
  );
}
