'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { readerHref } from '../../lib/calendar';
import { reviewLaterList, type ReviewLaterEntry } from '../../lib/personal-library';
import { ScheduleReading } from './schedule-reading';

/**
 * CAL-04: the user's "cần xem lại" marks from every readable document, each one a link back to
 * its page and a "Lên lịch ôn" form that books a review session on this calendar.
 */
export function ReviewLaterPanel({ onScheduled }: { onScheduled: () => void }) {
  const [items, setItems] = useState<ReviewLaterEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    reviewLaterList(page, controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return;
        setItems((current) => (page === 1 ? list.items : [...(current ?? []), ...list.items]));
        setTotal(list.total);
        setError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, attempt]);
  return (
    <aside className="calendar-tasks calendar-review" aria-labelledby="calendar-review-title">
      <h2 id="calendar-review-title">Cần xem lại</h2>
      {!items ? (
        !error && <p role="status">Đang tải mục cần xem lại…</p>
      ) : items.length === 0 ? (
        <p className="field-hint">
          Chưa có mục nào. Trong trình đọc, mở sổ ghi chú và chọn “Đánh dấu cần xem lại”.
        </p>
      ) : (
        <ul className="calendar-task-list">
          {items.map((entry) => (
            <li key={entry.id} className="calendar-color-orange">
              <div>
                <strong>{entry.material?.title ?? 'Tài liệu không còn khả dụng'}</strong>
                <span className="field-hint">
                  {entry.kind === 'PAGE_NOTE' ? 'Ghi chú' : 'Đoạn tô'} · Trang {entry.pageNumber}
                </span>
                {entry.excerpt && <span className="calendar-review-excerpt">{entry.excerpt}</span>}
                {entry.material && (
                  <>
                    <Link href={readerHref(entry)}>Mở trang {entry.pageNumber}</Link>
                    <ScheduleReading
                      purpose="review"
                      versionId={entry.versionId}
                      pageNumber={entry.pageNumber}
                      title={entry.material.title}
                      onCreated={onScheduled}
                    />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="form-error">
          Chưa tải được mục cần xem lại.{' '}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setLoading(true);
              setAttempt((v) => v + 1);
            }}
          >
            Thử lại
          </button>
        </p>
      )}
      {items && items.length < total && !error && (
        <button
          type="button"
          className="secondary-button"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setPage((v) => v + 1);
          }}
        >
          {loading ? 'Đang tải…' : `Xem thêm (${total - items.length})`}
        </button>
      )}
    </aside>
  );
}
