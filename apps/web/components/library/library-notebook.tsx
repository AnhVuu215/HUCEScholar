'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/auth';
import { readerHref } from '../../lib/calendar';
import {
  exportNotebook,
  notebookCourses,
  searchNotebook,
  type NotebookCourse,
  type NotebookEntry,
  type NotebookFilters,
} from '../../lib/notebook';
import { personalError } from '../../lib/reading';
import { SelectField } from '../ui/select-field';
import {
  AnnotationFilterFields,
  AnnotationSummary,
  NotesExport,
  ReviewMarkButton,
  emptyFilterState,
  toAnnotationFilters,
  usePagedAnnotations,
  useReviewMark,
  type FilterState,
} from './notebook-parts';

/**
 * LEARN-03: the signed-in user's notes and highlights across every readable document, with the
 * reader notebook's filters plus a course. Editing stays in the reader; each entry links there.
 */
export function LibraryNotebook() {
  const [fields, setFields] = useState<FilterState>(emptyFilterState);
  const [courseId, setCourseId] = useState('');
  const [courses, setCourses] = useState<NotebookCourse[]>([]);
  const [search, setSearch] = useState<{ filters: NotebookFilters; iteration: number }>({
    filters: {},
    iteration: 0,
  });
  useEffect(() => {
    const controller = new AbortController();
    // Without the list the filter only offers "Mọi môn"; searching still works.
    notebookCourses(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setCourses(items);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return (
    <section className="content-section library-notebook" aria-labelledby="notebook-title">
      <h2 id="notebook-title">Ghi chú trên mọi tài liệu</h2>
      <p className="field-hint">
        Ghi chú trang và đoạn tô riêng của bạn trên các tài liệu còn mở được. Sửa nội dung trong
        trình đọc.
      </p>
      <form
        method="post"
        className="notebook-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch({
            iteration: search.iteration + 1,
            filters: {
              ...toAnnotationFilters(fields),
              ...(courses.some((c) => c.id === courseId) ? { courseId } : {}),
            },
          });
        }}
      >
        <AnnotationFilterFields idPrefix="library-notebook" value={fields} onChange={setFields}>
          <SelectField
            id="library-notebook-course"
            label="Môn học"
            value={courseId}
            options={[
              { value: '', label: 'Mọi môn' },
              ...courses.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
            ]}
            onChange={setCourseId}
          />
        </AnnotationFilterFields>
        <button className="primary-button" type="submit">
          Tìm ghi chú
        </button>
      </form>
      {/* Exports what the last search filtered, not fields edited since. */}
      <NotesExport
        label="Tải sổ tay theo bộ lọc đang xem"
        download={(format) => exportNotebook(search.filters, format)}
        tooLarge="Sổ tay có quá nhiều mục để xuất một lần. Thu hẹp bộ lọc rồi thử lại."
      />
      {/* A new result session per search, so an old cursor or late response cannot mix in. */}
      <NotebookResults key={search.iteration} filters={search.filters} />
    </section>
  );
}
function failure(cause: unknown) {
  return {
    clear: false,
    message:
      cause instanceof ApiError && [401, 403].includes(cause.status)
        ? personalError(cause)
        : 'Chưa tải được sổ tay. Kiểm tra kết nối rồi thử lại.',
  };
}
function NotebookResults({ filters }: { filters: NotebookFilters }) {
  const fetchPage = useCallback(
    (cursor: string | null, signal: AbortSignal) => searchNotebook(filters, cursor, signal),
    [filters],
  );
  const { items, setItems, cursor, loading, error, start, retry } = usePagedAnnotations(
    fetchPage,
    failure,
  );
  const review = useReviewMark(setItems);
  // Results arrive sorted by version, so consecutive entries share one document heading.
  const groups: {
    versionId: string;
    material: NotebookEntry['material'];
    items: NotebookEntry[];
  }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last?.versionId === item.versionId) last.items.push(item);
    else groups.push({ versionId: item.versionId, material: item.material, items: [item] });
  }
  return (
    <>
      <p role="status" className="field-hint">
        {loading
          ? 'Đang tìm ghi chú…'
          : error
            ? ''
            : `${items.length}${cursor ? '+' : ''} mục trong ${groups.length} tài liệu`}
      </p>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button className="secondary-button" disabled={loading} onClick={retry}>
            Thử lại tìm kiếm
          </button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <p>
          Không có ghi chú phù hợp. Thử đổi bộ lọc, hoặc mở tài liệu trong{' '}
          <Link href="/workspace/library">kho học liệu</Link> để ghi chú khi đọc.
        </p>
      )}
      {review.message && (
        <p role="status" className="field-hint">
          {review.message}
        </p>
      )}
      {groups.map((group) => {
        const title = group.material?.title ?? 'Tài liệu không còn khả dụng';
        return (
          <section key={group.versionId} className="notebook-group" aria-label={title}>
            <h3>{title}</h3>
            {group.material && (
              <p className="field-hint">
                Phiên bản {group.material.versionNo}
                {!group.material.current && ' (bản cũ)'}
                {group.material.courses.length > 0 &&
                  ` · ${group.material.courses.map((c) => c.code).join(', ')}`}
              </p>
            )}
            <div className="notebook-results">
              {group.items.map((item) => (
                <article key={item.id} aria-label={`Mục ghi chú ${item.id}`}>
                  <AnnotationSummary item={item} />
                  {group.material && (
                    <Link className="secondary-button" href={readerHref(item)}>
                      Mở trang {item.pageNumber}
                    </Link>
                  )}
                  <ReviewMarkButton
                    item={item}
                    busy={review.marking === item.id}
                    onClick={() => void review.mark(item)}
                  />
                </article>
              ))}
            </div>
          </section>
        );
      })}
      {cursor && !error && (
        <button className="secondary-button" disabled={loading} onClick={() => start(cursor)}>
          {loading ? 'Đang tải…' : 'Tải thêm ghi chú'}
        </button>
      )}
    </>
  );
}
