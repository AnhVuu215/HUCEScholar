'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/auth';
import {
  exportNotes,
  searchAnnotations,
  setReviewLater,
  type NotesExportFormat,
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
function NotesExport({ versionId }: { versionId: string }) {
  const [pending, setPending] = useState<NotesExportFormat | null>(null);
  const [message, setMessage] = useState('');
  async function download(format: NotesExportFormat) {
    setPending(format);
    setMessage('');
    try {
      const file = await exportNotes(versionId, format);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage('Đã tạo file ghi chú.');
    } catch (failure) {
      setMessage(
        failure instanceof ApiError && failure.code === 'EXPORT_TOO_LARGE'
          ? 'Phiên bản có quá nhiều ghi chú để xuất một lần.'
          : failure instanceof ApiError
            ? personalError(failure)
            : 'Chưa tải được file ghi chú. Kiểm tra kết nối rồi thử lại.',
      );
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="notebook-export" role="group" aria-label="Tải ghi chú của bạn">
      <span>Tải ghi chú của bạn:</span>
      <button
        className="text-button"
        disabled={!!pending}
        onClick={() => void download('markdown')}
      >
        {pending === 'markdown' ? 'Đang tạo…' : 'Markdown (.md)'}
      </button>
      <button className="text-button" disabled={!!pending} onClick={() => void download('text')}>
        {pending === 'text' ? 'Đang tạo…' : 'Văn bản (.txt)'}
      </button>
      {message && (
        <p role="status" className="field-hint">
          {message}
        </p>
      )}
    </div>
  );
}
export function ReaderNotebook({ versionId, active, available, onSelect }: NotebookProps) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [color, setColor] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [search, setSearch] = useState<{ filters: AnnotationFilters; iteration: number }>({
    filters: {},
    iteration: 0,
  });
  return (
    <section className="reader-notebook" aria-label="Sổ ghi chú phiên bản này">
      <p className="field-hint">
        Ghi chú riêng trên mọi trang của phiên bản này. Tìm trong nội dung và chữ đã tô.
      </p>
      <NotesExport versionId={versionId} />
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
              ...(reviewOnly ? { reviewLater: true as const } : {}),
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
        <label className="eligibility-check notebook-review-filter">
          <input
            type="checkbox"
            checked={reviewOnly}
            onChange={(event) => setReviewOnly(event.target.checked)}
          />
          <span>Chỉ mục cần xem lại</span>
        </label>
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
  const [marking, setMarking] = useState<string | null>(null);
  const [markMessage, setMarkMessage] = useState('');
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
  async function mark(item: AnnotationItem) {
    if (marking) return;
    setMarking(item.id);
    setMarkMessage('');
    try {
      const saved = await setReviewLater(versionId, item, !item.reviewLater);
      // An item unmarked under the "cần xem lại" filter stays until the next search, so focus does not jump.
      setItems((old) => old.map((entry) => (entry.id === saved.id ? saved : entry)));
      setMarkMessage(
        saved.reviewLater
          ? `Đã đánh dấu cần xem lại · Trang ${saved.pageNumber}.`
          : `Đã bỏ dấu cần xem lại · Trang ${saved.pageNumber}.`,
      );
    } catch (failure) {
      setMarkMessage(
        failure instanceof ApiError
          ? personalError(failure)
          : 'Chưa lưu được dấu cần xem lại. Kiểm tra kết nối rồi thử lại.',
      );
    } finally {
      setMarking(null);
    }
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
      {markMessage && (
        <p role="status" className="field-hint">
          {markMessage}
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
              {item.reviewLater && <strong className="review-later-tag"> · Cần xem lại</strong>}
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
            {/* Not disabled while saving, so keyboard focus stays on the button. */}
            <button
              className="text-button"
              aria-busy={marking === item.id}
              onClick={() => void mark(item)}
            >
              {marking === item.id
                ? 'Đang lưu…'
                : item.reviewLater
                  ? 'Bỏ dấu cần xem lại'
                  : 'Đánh dấu cần xem lại'}
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
