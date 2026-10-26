'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/auth';
import { setReviewLater } from '../../lib/annotations';
import { readerHref } from '../../lib/calendar';
import { highlightColors, highlightColorLabel, isHighlightColor } from '../../lib/highlights';
import {
  notebookCourses,
  searchNotebook,
  type NotebookCourse,
  type NotebookEntry,
  type NotebookFilters,
} from '../../lib/notebook';
import { personalError } from '../../lib/reading';
import { SelectField } from '../ui/select-field';

/**
 * LEARN-03: the signed-in user's notes and highlights across every readable document, with the
 * reader notebook's filters plus a course. Editing stays in the reader; each entry links there.
 */
export function LibraryNotebook() {
  const [query, setQuery] = useState('');
  const [courseId, setCourseId] = useState('');
  const [kind, setKind] = useState('');
  const [color, setColor] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
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
              query: query.trim(),
              ...(courses.some((c) => c.id === courseId) ? { courseId } : {}),
              ...(kind === 'PAGE_NOTE' || kind === 'TEXT_HIGHLIGHT' ? { kind } : {}),
              ...(kind !== 'PAGE_NOTE' && isHighlightColor(color) ? { color } : {}),
              ...(reviewOnly ? { reviewLater: true as const } : {}),
            },
          });
        }}
      >
        <div className="form-field notebook-query">
          <label htmlFor="library-notebook-query">Tìm trong ghi chú</label>
          <input
            id="library-notebook-query"
            type="search"
            maxLength={100}
            value={query}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            aria-describedby="library-notebook-hint"
          />
          <p id="library-notebook-hint" className="field-hint">
            Tìm cụm chữ có dấu, không phân biệt hoa thường. Tối đa 100 ký tự.
          </p>
        </div>
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
        <SelectField
          id="library-notebook-kind"
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
          id="library-notebook-color"
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
      {/* A new result session per search, so an old cursor or late response cannot mix in. */}
      <NotebookResults key={search.iteration} filters={search.filters} />
    </section>
  );
}
function NotebookResults({ filters }: { filters: NotebookFilters }) {
  const [items, setItems] = useState<NotebookEntry[]>([]);
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
      void searchNotebook(filters, after, controller.signal)
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
          setError(
            cause instanceof ApiError && [401, 403].includes(cause.status)
              ? personalError(cause)
              : 'Chưa tải được sổ tay. Kiểm tra kết nối rồi thử lại.',
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    },
    [filters],
  );
  useEffect(() => {
    load();
    return () => request.current?.abort();
  }, [load]);
  function start(after: string | null = null) {
    setLoading(true);
    setError('');
    load(after);
  }
  async function mark(item: NotebookEntry) {
    if (marking) return;
    setMarking(item.id);
    setMarkMessage('');
    try {
      const saved = await setReviewLater(item.versionId, item, !item.reviewLater);
      // An item unmarked under the "cần xem lại" filter stays until the next search, so focus does not jump.
      setItems((old) =>
        old.map((entry) =>
          entry.id === saved.id ? { ...saved, material: entry.material } : entry,
        ),
      );
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
        <p>
          Không có ghi chú phù hợp. Thử đổi bộ lọc, hoặc mở tài liệu trong{' '}
          <Link href="/workspace/library">kho học liệu</Link> để ghi chú khi đọc.
        </p>
      )}
      {markMessage && (
        <p role="status" className="field-hint">
          {markMessage}
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
                  <p className="field-hint">
                    {item.kind === 'PAGE_NOTE'
                      ? 'Ghi chú trang'
                      : `Đoạn tô · ${highlightColorLabel(item.color)}`}{' '}
                    · Trang {item.pageNumber}
                    {item.reviewLater && (
                      <strong className="review-later-tag"> · Cần xem lại</strong>
                    )}
                  </p>
                  {item.kind === 'TEXT_HIGHLIGHT' && <blockquote>{item.anchor.quote}</blockquote>}
                  {item.content && <p className="note-content">{item.content}</p>}
                  {group.material && (
                    <Link className="secondary-button" href={readerHref(item)}>
                      Mở trang {item.pageNumber}
                    </Link>
                  )}
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
