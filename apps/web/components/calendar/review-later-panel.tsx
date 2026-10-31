'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { readerHref } from '../../lib/calendar';
import {
  reviewLaterFilters,
  reviewLaterList,
  type ReviewLaterEntry,
  type ReviewLaterFilters,
  type ReviewLaterScope,
} from '../../lib/personal-library';
import { SelectField } from '../ui/select-field';
import { ScheduleReading } from './schedule-reading';

/** The notebook's review session (LEARN-04) over these marks, under the same filters. */
function sessionHref(scope: ReviewLaterScope) {
  const params = new URLSearchParams({ review: 'marked' });
  if (scope.courseId) params.set('courseId', scope.courseId);
  if (scope.versionId) params.set('versionId', scope.versionId);
  return `/workspace/notebook?${params}`;
}

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
  const [scope, setScope] = useState<ReviewLaterScope>({ courseId: '', versionId: '' });
  const [filters, setFilters] = useState<ReviewLaterFilters | null>(null);
  // The menus only narrow the list; without them every mark still shows.
  useEffect(() => {
    const controller = new AbortController();
    reviewLaterFilters(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setFilters(result);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const controller = new AbortController();
    reviewLaterList(page, controller.signal, scope)
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
  }, [page, attempt, scope]);
  // The old rows stay until the new ones arrive, so an open "Lên lịch ôn" form of a row that is
  // still in the filter keeps what was typed.
  function narrow(next: Partial<ReviewLaterScope>) {
    setLoading(true);
    setPage(1);
    setScope((v) => ({ ...v, ...next }));
  }
  const filtered = Boolean(scope.courseId || scope.versionId);
  return (
    <aside className="calendar-tasks calendar-review" aria-labelledby="calendar-review-title">
      <h2 id="calendar-review-title">Cần xem lại</h2>
      {filters && (filters.documents.length > 1 || filters.courses.length > 0) && (
        <div className="calendar-review-filters">
          <SelectField
            id="calendar-review-course"
            label="Môn học"
            value={scope.courseId}
            options={[
              { value: '', label: 'Mọi môn' },
              ...filters.courses.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
            ]}
            onChange={(courseId) => narrow({ courseId })}
          />
          <SelectField
            id="calendar-review-document"
            label="Tài liệu"
            value={scope.versionId}
            options={[
              { value: '', label: 'Mọi tài liệu' },
              ...filters.documents.map((d) => ({
                value: d.versionId,
                label: `${d.title} (${d.marks})`,
              })),
            ]}
            onChange={(versionId) => narrow({ versionId })}
          />
        </div>
      )}
      {items && items.length > 0 && (
        <Link className="secondary-button" href={sessionHref(scope)}>
          Ôn lần lượt {total} mục{filtered ? ' đang lọc' : ''}
        </Link>
      )}
      {!items ? (
        !error && <p role="status">Đang tải mục cần xem lại…</p>
      ) : items.length === 0 ? (
        <p className="field-hint">
          {filtered
            ? 'Không có mục nào trong bộ lọc này.'
            : 'Chưa có mục nào. Trong trình đọc, chọn “Đánh dấu cần xem lại” ở ghi chú hoặc đoạn tô.'}
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
