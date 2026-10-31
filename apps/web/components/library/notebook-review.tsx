'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { readerHref } from '../../lib/calendar';
import { searchNotebook, type NotebookEntry, type NotebookFilters } from '../../lib/notebook';
import { AnnotationSummary, ReviewMarkButton, useReviewMark } from './notebook-parts';

/** A session walks at most this many entries, in the notebook's own order. */
export const MAX_REVIEW_ENTRIES = 200;

/**
 * LEARN-04 "Buổi ôn tập": the entries one search filtered, one at a time, in document and page
 * order. "Đã xem" lives only in this session; the "cần xem lại" mark is the saved one, so a session
 * can end with a pass over just the entries still marked.
 */
export function NotebookReview({
  filters,
  close,
}: {
  filters: NotebookFilters;
  close: () => void;
}) {
  const [items, setItems] = useState<NotebookEntry[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  /** Ids of this pass, in order; a second pass keeps only the marked ones. */
  const [order, setOrder] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const review = useReviewMark(setItems);
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const found: NotebookEntry[] = [];
      let cursor: string | null = null;
      do {
        const page = await searchNotebook(filters, cursor, controller.signal);
        found.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor && found.length < MAX_REVIEW_ENTRIES);
      return { found: found.slice(0, MAX_REVIEW_ENTRIES), more: cursor !== null };
    })()
      .then(({ found, more }) => {
        if (controller.signal.aborted) return;
        setItems(found);
        setMore(more);
        setOrder(found.map((item) => item.id));
        setIndex(0);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError('Chưa tải được các mục để ôn. Kiểm tra kết nối rồi thử lại.');
        setLoading(false);
      });
    return () => controller.abort();
  }, [filters, attempt]);
  const done = !loading && order.length > 0 && index >= order.length;
  useEffect(() => {
    (done ? summary : heading).current?.focus();
  }, [index, done, loading]);

  const byId = new Map(items.map((item) => [item.id, item]));
  const marked = order.filter((id) => byId.get(id)?.reviewLater);
  function restart(ids: string[]) {
    setOrder(ids);
    setIndex(0);
  }

  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        <button
          className="secondary-button"
          onClick={() => {
            setError('');
            setLoading(true);
            setAttempt((v) => v + 1);
          }}
        >
          Thử tải lại
        </button>
        <button className="text-button" onClick={close}>
          Về sổ tay
        </button>
      </div>
    );
  if (loading) return <p role="status">Đang chuẩn bị buổi ôn…</p>;
  if (!items.length)
    return (
      <div>
        <p>Không có mục nào trong bộ lọc này để ôn.</p>
        <button className="secondary-button" onClick={close}>
          Về sổ tay
        </button>
      </div>
    );
  const item = done ? null : byId.get(order[index]);
  return (
    <section className="notebook-review" aria-labelledby="notebook-review-title">
      <div className="notebook-review-head">
        <h3 id="notebook-review-title">Buổi ôn tập</h3>
        <button type="button" className="text-button" onClick={close}>
          Kết thúc buổi ôn
        </button>
      </div>
      {more && (
        <p className="field-hint">
          Buổi ôn này gồm {MAX_REVIEW_ENTRIES} mục đầu tiên của bộ lọc. Thu hẹp bộ lọc để ôn phần
          còn lại.
        </p>
      )}
      {review.message && (
        <p role="status" className="field-hint">
          {review.message}
        </p>
      )}
      {done ? (
        <div className="notebook-review-card">
          <h4 ref={summary} tabIndex={-1}>
            Đã xem hết {order.length} mục
          </h4>
          <p>
            {marked.length
              ? `${marked.length} mục đang đánh dấu cần xem lại.`
              : 'Không còn mục nào đánh dấu cần xem lại trong buổi này.'}
          </p>
          <div className="note-actions">
            {marked.length > 0 && (
              <button className="primary-button" onClick={() => restart(marked)}>
                Ôn lại {marked.length} mục cần xem lại
              </button>
            )}
            <button
              className="secondary-button"
              onClick={() => restart(items.map((entry) => entry.id))}
            >
              Ôn lại từ đầu
            </button>
            <button className="text-button" onClick={close}>
              Về sổ tay
            </button>
          </div>
        </div>
      ) : (
        item && (
          <article
            className="notebook-review-card"
            aria-label={`Mục ${index + 1} / ${order.length}`}
          >
            <p className="field-hint">
              Mục {index + 1} / {order.length}
            </p>
            <h4 ref={heading} tabIndex={-1}>
              {item.material?.title ?? 'Tài liệu không còn khả dụng'} · Trang {item.pageNumber}
            </h4>
            <AnnotationSummary item={item} />
            <div className="note-actions">
              {item.material && (
                <Link className="text-button" href={readerHref(item)}>
                  Mở trang {item.pageNumber}
                </Link>
              )}
              <ReviewMarkButton
                item={item}
                busy={review.marking === item.id}
                onClick={() => void review.mark(item)}
              />
            </div>
            <div className="note-actions">
              <button
                className="secondary-button"
                disabled={index === 0}
                onClick={() => setIndex((v) => v - 1)}
              >
                Mục trước
              </button>
              <button className="primary-button" onClick={() => setIndex((v) => v + 1)}>
                {index + 1 === order.length ? 'Đã xem, kết thúc' : 'Đã xem, mục tiếp'}
              </button>
            </div>
          </article>
        )
      )}
    </section>
  );
}
