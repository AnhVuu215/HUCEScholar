'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/auth';
import {
  searchAnnotations,
  type AnnotationFilters,
  type AnnotationItem,
} from '../../lib/annotations';
import { highlightColors, highlightColorLabel, isHighlightColor } from '../../lib/highlights';
import { personalError } from '../../lib/reading';
import { SelectField } from '../ui/select-field';

type NotebookProps = {
  versionId: string;
  active: boolean;
  available: boolean;
  onSelect: (item: AnnotationItem) => void;
};
export function ReaderNotebook({ versionId, active, available, onSelect }: NotebookProps) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [color, setColor] = useState('');
  const [search, setSearch] = useState<{ filters: AnnotationFilters; iteration: number }>({
    filters: {},
    iteration: 0,
  });
  return (
    <section className="reader-notebook" aria-label="Sổ ghi chú phiên bản này">
      <p className="field-hint">
        Ghi chú riêng trên mọi trang của phiên bản này. Tìm trong nội dung và chữ đã tô.
      </p>
      <form
        method="post"
        className="notebook-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch({
            iteration: search.iteration + 1,
            filters: {
              query: query.trim(),
              ...(kind === 'PAGE_NOTE' || kind === 'TEXT_HIGHLIGHT' ? { kind } : {}),
              ...(kind !== 'PAGE_NOTE' && isHighlightColor(color) ? { color } : {}),
            },
          });
        }}
      >
        <div className="form-field">
          <label htmlFor="notebook-query">Tìm trong ghi chú</label>
          <input
            id="notebook-query"
            type="search"
            maxLength={100}
            value={query}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            aria-describedby="notebook-search-hint"
          />
          <p id="notebook-search-hint" className="field-hint">
            Tìm cụm chữ có dấu, không phân biệt hoa thường. Tối đa 100 ký tự.
          </p>
        </div>
        <SelectField
          id="notebook-kind"
          label="Loại ghi chú"
          value={kind}
          options={[
            { value: '', label: 'Mọi loại' },
            { value: 'PAGE_NOTE', label: 'Ghi chú trang' },
            { value: 'TEXT_HIGHLIGHT', label: 'Đoạn tô' },
          ]}
          onChange={(value) => {
            setKind(value);
            if (value === 'PAGE_NOTE') setColor('');
          }}
        />
        <SelectField
          id="notebook-color"
          label="Màu tô"
          value={color}
          disabled={kind === 'PAGE_NOTE'}
          options={[
            { value: '', label: 'Mọi màu' },
            ...Object.entries(highlightColors).map(([value, label]) => ({ value, label })),
          ]}
          onChange={setColor}
        />
        <button className="primary-button" type="submit">
          Tìm ghi chú
        </button>
      </form>
      {/* A new result session clears pagination on re-entry; filters and both editors stay mounted. */}
      {active && (
        <NotebookResults
          key={versionId + ':' + search.iteration}
          versionId={versionId}
          filters={search.filters}
          available={available}
          onSelect={onSelect}
        />
      )}
    </section>
  );
}
function NotebookResults({
  versionId,
  filters,
  available,
  onSelect,
}: Omit<NotebookProps, 'active'> & { filters: AnnotationFilters }) {
  const [items, setItems] = useState<AnnotationItem[]>([]);
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
      void searchAnnotations(versionId, filters, after, controller.signal)
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
          const unavailable = cause instanceof ApiError && [401, 403, 404].includes(cause.status);
          if (unavailable) {
            setItems([]);
            setCursor(null);
            failedCursor.current = null;
          }
          setError(
            unavailable
              ? personalError(cause)
              : 'Chưa tải được danh sách. Thử lại; bản soạn vẫn được giữ.',
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    },
    [versionId, filters],
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
  return (
    <>
      <button className="quiet-button" disabled={loading} onClick={() => start()}>
        Làm mới danh sách
      </button>
      {!available && <p className="field-hint">Chờ mở được tài liệu để chuyển đến ghi chú.</p>}
      {loading && <p role="status">Đang tìm ghi chú…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            className="secondary-button"
            disabled={loading}
            onClick={() => start(failedCursor.current)}
          >
            Thử lại tìm kiếm
          </button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="field-hint">
          Không có ghi chú phù hợp. Thử đổi bộ lọc hoặc viết ghi chú ở trang đang đọc.
        </p>
      )}
      <div className="notebook-results">
        {items.map((item) => (
          <article key={item.id} aria-label={`Mục ghi chú ${item.id}`}>
            <p className="field-hint">
              {item.kind === 'PAGE_NOTE'
                ? 'Ghi chú trang'
                : `Đoạn tô · ${highlightColorLabel(item.color)}`}{' '}
              · Trang {item.pageNumber}
            </p>
            {item.kind === 'TEXT_HIGHLIGHT' && <blockquote>{item.anchor.quote}</blockquote>}
            {item.content && <p className="note-content">{item.content}</p>}
            <button
              className="secondary-button"
              disabled={!available}
              onClick={() => onSelect(item)}
            >
              {item.kind === 'PAGE_NOTE' ? 'Mở ghi chú' : 'Mở đoạn tô'} · Trang {item.pageNumber}
            </button>
          </article>
        ))}
      </div>
      {cursor && !error && (
        <button className="secondary-button" disabled={loading} onClick={() => start(cursor)}>
          Tải thêm ghi chú
        </button>
      )}
    </>
  );
}
