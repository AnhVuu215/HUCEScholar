'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { ApiError } from '../../lib/auth';
import { setReviewLater, type AnnotationFilters, type AnnotationItem } from '../../lib/annotations';
import { highlightColors, highlightColorLabel, isHighlightColor } from '../../lib/highlights';
import { personalError } from '../../lib/reading';
import { SelectField } from '../ui/select-field';

/** Shared by the reader's notebook (LEARN-01/02) and the library-wide notebook (LEARN-03). */
export type FilterState = { query: string; kind: string; color: string; reviewOnly: boolean };
export const emptyFilterState: FilterState = { query: '', kind: '', color: '', reviewOnly: false };
export function toAnnotationFilters(state: FilterState): AnnotationFilters {
  const kind = state.kind === 'PAGE_NOTE' || state.kind === 'TEXT_HIGHLIGHT' ? state.kind : null;
  return {
    query: state.query.trim(),
    ...(kind ? { kind } : {}),
    ...(kind !== 'PAGE_NOTE' && isHighlightColor(state.color) ? { color: state.color } : {}),
    ...(state.reviewOnly ? { reviewLater: true as const } : {}),
  };
}
/** Text, kind, colour and "cần xem lại" fields; `children` go right after the text field. */
export function AnnotationFilterFields({
  idPrefix,
  value,
  onChange,
  children,
}: {
  idPrefix: string;
  value: FilterState;
  onChange: (value: FilterState) => void;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="form-field notebook-query">
        <label htmlFor={`${idPrefix}-query`}>Tìm trong ghi chú</label>
        <input
          id={`${idPrefix}-query`}
          type="search"
          maxLength={100}
          value={value.query}
          autoComplete="off"
          onChange={(event) => onChange({ ...value, query: event.target.value })}
          aria-describedby={`${idPrefix}-search-hint`}
        />
        <p id={`${idPrefix}-search-hint`} className="field-hint">
          Tìm cụm chữ có dấu, không phân biệt hoa thường. Tối đa 100 ký tự.
        </p>
      </div>
      {children}
      <SelectField
        id={`${idPrefix}-kind`}
        label="Loại ghi chú"
        value={value.kind}
        options={[
          { value: '', label: 'Mọi loại' },
          { value: 'PAGE_NOTE', label: 'Ghi chú trang' },
          { value: 'TEXT_HIGHLIGHT', label: 'Đoạn tô' },
        ]}
        onChange={(kind) =>
          onChange({ ...value, kind, ...(kind === 'PAGE_NOTE' ? { color: '' } : {}) })
        }
      />
      <SelectField
        id={`${idPrefix}-color`}
        label="Màu tô"
        value={value.color}
        disabled={value.kind === 'PAGE_NOTE'}
        options={[
          { value: '', label: 'Mọi màu' },
          ...Object.entries(highlightColors).map(([color, label]) => ({ value: color, label })),
        ]}
        onChange={(color) => onChange({ ...value, color })}
      />
      <label className="eligibility-check notebook-review-filter">
        <input
          type="checkbox"
          checked={value.reviewOnly}
          onChange={(event) => onChange({ ...value, reviewOnly: event.target.checked })}
        />
        <span>Chỉ mục cần xem lại</span>
      </label>
    </>
  );
}

type Page<T> = { items: T[]; nextCursor: string | null };
/**
 * One search session with "load more": a newer request aborts the older one, a late response is
 * dropped, and a failed page keeps what was loaded so it can be retried. `failure` must be a
 * stable function; `clear` drops loaded items (for example when access was lost).
 */
export function usePagedAnnotations<T extends { id: string }>(
  fetchPage: (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>,
  failure: (cause: unknown) => { message: string; clear: boolean },
) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const failedCursor = useRef<string | null>(null);
  const load = useCallback(
    (after: string | null = null) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      failedCursor.current = after;
      void fetchPage(after, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setItems((old) =>
            after
              ? [...new Map([...old, ...result.items].map((item) => [item.id, item])).values()]
              : result.items,
          );
          setCursor(result.nextCursor);
          setError('');
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          const { message, clear } = failure(cause);
          if (clear) {
            setItems([]);
            setCursor(null);
            failedCursor.current = null;
          }
          setError(message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    },
    [fetchPage, failure],
  );
  useEffect(() => {
    load();
    return () => request.current?.abort();
  }, [load]);
  function start(after: string | null = null) {
    setLoading(true);
    setError('');
    if (!after) {
      setItems([]);
      setCursor(null);
    }
    load(after);
  }
  return {
    items,
    setItems,
    cursor,
    loading,
    error,
    start,
    retry: () => start(failedCursor.current),
  };
}

/** The owner's private "cần xem lại" mark, saved without changing the note's revision. */
export function useReviewMark<T extends AnnotationItem>(setItems: Dispatch<SetStateAction<T[]>>) {
  const [marking, setMarking] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  async function mark(item: T) {
    if (marking) return;
    setMarking(item.id);
    setMessage('');
    try {
      const saved = await setReviewLater(item.versionId, item, !item.reviewLater);
      // An item unmarked under the "cần xem lại" filter stays until the next search, so focus does not jump.
      setItems((old) =>
        old.map((entry) => (entry.id === saved.id ? ({ ...entry, ...saved } as T) : entry)),
      );
      setMessage(
        saved.reviewLater
          ? `Đã đánh dấu cần xem lại · Trang ${saved.pageNumber}.`
          : `Đã bỏ dấu cần xem lại · Trang ${saved.pageNumber}.`,
      );
    } catch (failure) {
      setMessage(
        failure instanceof ApiError
          ? personalError(failure)
          : 'Chưa lưu được dấu cần xem lại. Kiểm tra kết nối rồi thử lại.',
      );
    } finally {
      setMarking(null);
    }
  }
  return { marking, message, mark };
}
/** Not disabled while saving, so keyboard focus stays on the button. */
export function ReviewMarkButton({
  item,
  busy,
  onClick,
}: {
  item: AnnotationItem;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button className="text-button" aria-busy={busy} onClick={onClick}>
      {busy ? 'Đang lưu…' : item.reviewLater ? 'Bỏ dấu cần xem lại' : 'Đánh dấu cần xem lại'}
    </button>
  );
}
/** Kind, colour, page and mark, then the highlighted quote and the owner's text. */
export function AnnotationSummary({ item }: { item: AnnotationItem }) {
  return (
    <>
      <p className="field-hint">
        {item.kind === 'PAGE_NOTE'
          ? 'Ghi chú trang'
          : `Đoạn tô · ${highlightColorLabel(item.color)}`}{' '}
        · Trang {item.pageNumber}
        {item.reviewLater && <strong className="review-later-tag"> · Cần xem lại</strong>}
      </p>
      {item.kind === 'TEXT_HIGHLIGHT' && <blockquote>{item.anchor.quote}</blockquote>}
      {item.content && <p className="note-content">{item.content}</p>}
    </>
  );
}
