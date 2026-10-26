'use client';

import { useCallback, useState } from 'react';
import { ApiError } from '../../lib/auth';
import {
  exportNotes,
  searchAnnotations,
  type NotesExportFormat,
  type AnnotationFilters,
  type AnnotationItem,
} from '../../lib/annotations';
import { personalError } from '../../lib/reading';
import {
  AnnotationFilterFields,
  AnnotationSummary,
  ReviewMarkButton,
  emptyFilterState,
  toAnnotationFilters,
  usePagedAnnotations,
  useReviewMark,
  type FilterState,
} from './notebook-parts';

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
  const [fields, setFields] = useState<FilterState>(emptyFilterState);
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
          setSearch({ iteration: search.iteration + 1, filters: toAnnotationFilters(fields) });
        }}
      >
        <AnnotationFilterFields idPrefix="notebook" value={fields} onChange={setFields} />
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
/** Losing access clears the list; any other failure keeps it so the page can be retried. */
function failure(cause: unknown) {
  const unavailable = cause instanceof ApiError && [401, 403, 404].includes(cause.status);
  return {
    clear: unavailable,
    message: unavailable
      ? personalError(cause)
      : 'Chưa tải được danh sách. Thử lại; bản soạn vẫn được giữ.',
  };
}
function NotebookResults({
  versionId,
  filters,
  available,
  onSelect,
}: Omit<NotebookProps, 'active'> & { filters: AnnotationFilters }) {
  const fetchPage = useCallback(
    (cursor: string | null, signal: AbortSignal) =>
      searchAnnotations(versionId, filters, cursor, signal),
    [versionId, filters],
  );
  const { items, setItems, cursor, loading, error, start, retry } = usePagedAnnotations(
    fetchPage,
    failure,
  );
  const review = useReviewMark(setItems);
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
          <button className="secondary-button" disabled={loading} onClick={retry}>
            Thử lại tìm kiếm
          </button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="field-hint">
          Không có ghi chú phù hợp. Thử đổi bộ lọc hoặc viết ghi chú ở trang đang đọc.
        </p>
      )}
      {review.message && (
        <p role="status" className="field-hint">
          {review.message}
        </p>
      )}
      <div className="notebook-results">
        {items.map((item) => (
          <article key={item.id} aria-label={`Mục ghi chú ${item.id}`}>
            <AnnotationSummary item={item} />
            <button
              className="secondary-button"
              disabled={!available}
              onClick={() => onSelect(item)}
            >
              {item.kind === 'PAGE_NOTE' ? 'Mở ghi chú' : 'Mở đoạn tô'} · Trang {item.pageNumber}
            </button>
            <ReviewMarkButton
              item={item}
              busy={review.marking === item.id}
              onClick={() => void review.mark(item)}
            />
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
