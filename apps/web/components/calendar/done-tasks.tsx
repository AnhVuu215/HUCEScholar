'use client';
import { useEffect, useState } from 'react';
import { calendarError, doneTasks, whenLabel, type CalendarItem } from '../../lib/calendar';

/**
 * Finished tasks, newest first, hidden until asked for. Unticking one reopens it; the list
 * reloads whenever the calendar does, so a task ticked elsewhere shows up here.
 */
export function DoneTasks({
  attempt,
  busy,
  toggle,
  open,
}: {
  attempt: number;
  busy: boolean;
  toggle: (item: CalendarItem, done: boolean) => void;
  open: (item: CalendarItem) => void;
}) {
  const [shown, setShown] = useState(false);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CalendarItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  /** Unticked here and waiting for the reload; a failure reloads and ticks them again. */
  const [reopening, setReopening] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!shown) return;
    const controller = new AbortController();
    // A reload starts again from the first page, since done tasks may have moved.
    Promise.all(Array.from({ length: page }, (_, i) => doneTasks(i + 1, controller.signal)))
      .then((pages) => {
        if (controller.signal.aborted) return;
        setItems(pages.flatMap((p) => p.items));
        setReopening(new Set());
        setTotal(pages[0].total);
        setError('');
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(calendarError(failure));
      });
    return () => controller.abort();
  }, [shown, page, attempt]);
  return (
    <div className="calendar-done">
      <button
        type="button"
        className="text-button"
        aria-expanded={shown}
        aria-controls="calendar-done-list"
        onClick={() => setShown((v) => !v)}
      >
        {shown ? 'Ẩn việc đã xong' : 'Xem việc đã xong'}
      </button>
      <div id="calendar-done-list" hidden={!shown}>
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : !items ? (
          shown && <p role="status">Đang tải việc đã xong…</p>
        ) : items.length === 0 ? (
          <p className="field-hint">Chưa có việc nào đã xong.</p>
        ) : (
          <ul className="calendar-task-list" aria-label="Việc đã xong">
            {items.map((task) => (
              <li key={task.id} className={`calendar-color-${task.color} is-done`}>
                <input
                  type="checkbox"
                  className="calendar-task-check"
                  aria-label={`Hoàn thành: ${task.title}`}
                  checked={!reopening.has(task.id)}
                  disabled={busy}
                  onChange={() => {
                    setReopening((v) => new Set(v).add(task.id));
                    toggle(task, false);
                  }}
                />
                <div>
                  <button type="button" className="text-button" onClick={() => open(task)}>
                    {task.title}
                  </button>
                  {task.startsAt && <span className="field-hint">{whenLabel(task)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {items && items.length < total && !error && (
          <button type="button" className="secondary-button" onClick={() => setPage((v) => v + 1)}>
            Xem thêm ({total - items.length})
          </button>
        )}
      </div>
    </div>
  );
}
