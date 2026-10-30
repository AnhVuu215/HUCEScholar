'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { libraryError, libraryList, libraryCourses, type LibraryList } from '../../lib/library';
import { materialTypes } from '../../lib/materials';
import { Button } from '../ui/button';
import { SelectField } from '../ui/select-field';
import { libraryQueryString, parseLibraryQuery, type LibraryQuery } from '../../lib/library-query';
export function LibraryCatalog() {
  const params = useSearchParams();
  const raw = params.toString();
  const canonical = libraryQueryString(parseLibraryQuery(params));
  const query = useMemo(() => parseLibraryQuery(new URLSearchParams(canonical)), [canonical]);
  const [expanded, setExpanded] = useState(false);
  const focusTarget = useRef<string | null>(null);
  useEffect(() => {
    if (raw !== canonical)
      window.history.replaceState(
        null,
        '',
        `/workspace/library${canonical ? `?${canonical}` : ''}`,
      );
  }, [raw, canonical]);
  return (
    <CatalogSession
      key={canonical}
      query={query}
      focusTarget={focusTarget}
      expanded={expanded}
      toggle={() => setExpanded((value) => !value)}
    />
  );
}

function CatalogSession({
  query,
  focusTarget,
  expanded,
  toggle,
}: {
  query: LibraryQuery;
  focusTarget: RefObject<string | null>;
  expanded: boolean;
  toggle: () => void;
}) {
  const [search, setSearch] = useState(query.search),
    [courseId, setCourseId] = useState(query.courseId),
    [kind, setKind] = useState(query.kind),
    [materialType, setType] = useState(query.materialType);
  const [data, setData] = useState<LibraryList | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const [courses, setCourses] = useState<{ id: string; code: string; name: string }[]>([]),
    [courseError, setCourseError] = useState(false),
    [coursesLoaded, setCoursesLoaded] = useState(false);
  useEffect(() => {
    if (!focusTarget.current) return;
    // Pagination returns after the list loads. Do not steal focus if the user moved meanwhile.
    if (document.activeElement !== document.body) {
      focusTarget.current = null;
      return;
    }
    const target = document.getElementById(focusTarget.current);
    if (!target) return;
    const destination =
      target instanceof HTMLButtonElement && target.disabled
        ? document.getElementById('library-search')
        : target;
    destination?.focus({ preventScroll: true });
    focusTarget.current = null;
  }, [data, focusTarget]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(query.page), limit: '12' });
    for (const [key, value] of Object.entries(query))
      if (key !== 'page' && value) params.set(key, String(value));
    void libraryList(params, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) {
          setData(r);
          setError('');
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(libraryError(e));
          setData(null);
        }
      });
    return () => controller.abort();
  }, [query, attempt]);
  // Course choices come from the readable library, including inactive historical courses.
  useEffect(() => {
    const controller = new AbortController();
    void libraryCourses(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setCourses(items);
          setCoursesLoaded(true);
          setCourseError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setCourseError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  function submit(e: FormEvent) {
    e.preventDefault();
    navigate(parseLibraryQuery(new URLSearchParams({ search, courseId, kind, materialType })));
  }
  function navigate(next: LibraryQuery) {
    const value = libraryQueryString(next);
    const current = libraryQueryString(query);
    if (value === current) {
      setSearch(next.search);
      setCourseId(next.courseId);
      setKind(next.kind);
      setType(next.materialType);
      retry();
      return;
    }
    const active = document.activeElement;
    focusTarget.current =
      active instanceof HTMLElement && active.id && active.id !== 'library-clear'
        ? active.id
        : 'library-search';
    // Next integrates native history with useSearchParams without a document navigation.
    window.history.pushState(null, '', `/workspace/library${value ? `?${value}` : ''}`);
  }
  function retry() {
    setData(null);
    setError('');
    setAttempt((n) => n + 1);
  }
  const count = Number(Boolean(kind)) + Number(Boolean(materialType));
  const hasFilters = Boolean(search || courseId || kind || materialType || query.page > 1);
  return (
    <section className="content-section" aria-labelledby="library-results">
      <form className="library-filters" onSubmit={submit}>
        <div className="library-primary-filters">
          <div className="form-field">
            <label htmlFor="library-search">Tìm học liệu</label>
            <input
              id="library-search"
              value={search}
              maxLength={200}
              placeholder="Tiêu đề hoặc tác giả, gõ có dấu hay không đều được"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="library-course">Môn học</label>
            <select
              id="library-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            >
              <option value="">Tất cả môn</option>
              {courseId && !courses.some((course) => course.id === courseId) && (
                <option value={courseId}>
                  {coursesLoaded
                    ? 'Môn đã chọn không còn trong danh sách'
                    : 'Môn đã chọn (chưa tải danh sách)'}
                </option>
              )}
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="form"
            aria-expanded={expanded}
            aria-controls="library-extra-filters"
            onClick={toggle}
          >
            {count ? `Bộ lọc (${count})` : 'Bộ lọc'}
          </Button>
          <Button id="library-submit" type="submit" variant="primary" size="form">
            Tìm kiếm
          </Button>
        </div>
        <div id="library-extra-filters" className="library-extra-filters" hidden={!expanded}>
          <div className="form-field">
            <SelectField
              id="library-kind"
              label="Nguồn học liệu"
              value={kind}
              onChange={setKind}
              options={[
                { value: '', label: 'Tất cả nguồn' },
                { value: 'LECTURER_MATERIAL', label: 'Học liệu giảng viên' },
                { value: 'STUDENT_SUPPLEMENT', label: 'Tài liệu sinh viên bổ sung' },
              ]}
            />
          </div>
          <div className="form-field">
            <SelectField
              id="library-type"
              label="Loại học liệu"
              value={materialType}
              onChange={setType}
              options={[
                { value: '', label: 'Tất cả loại' },
                ...Object.entries(materialTypes).map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
        </div>
        {hasFilters && (
          <div>
            <button
              type="button"
              id="library-clear"
              className="secondary-button"
              onClick={() => {
                document.getElementById('library-search')?.focus({ preventScroll: true });
                navigate(parseLibraryQuery(new URLSearchParams()));
              }}
            >
              Xóa bộ lọc
            </button>
          </div>
        )}
      </form>
      {courseError && (
        <p role="alert">
          Chưa tải được bộ lọc môn. Bạn vẫn có thể tìm theo tiêu đề.{' '}
          <button className="secondary-button" onClick={retry}>
            Tải lại bộ lọc
          </button>
        </p>
      )}
      <h2 id="library-results">Học liệu đã công bố</h2>
      <p className="field-hint">
        Chỉ hiển thị bản hiện hành đủ quyền đọc. Học liệu giảng viên và tài liệu sinh viên bổ sung
        được ghi nhãn riêng.
      </p>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button className="secondary-button" onClick={retry}>
            Thử lại
          </button>
        </div>
      ) : !data ? (
        <p role="status">Đang tìm học liệu…</p>
      ) : (
        <>
          <p role="status">
            {data.total} học liệu · Trang {data.page}
            {query.search.trim() ? ' · Khớp tiêu đề xếp trước' : ' · Mới cập nhật trước'}
          </p>
          {data.items.length === 0 ? (
            <p>Chưa có học liệu phù hợp. Thử bỏ bớt bộ lọc hoặc tìm theo tiêu đề khác.</p>
          ) : (
            <ul className="library-list">
              {data.items.map((item) => (
                <li key={item.versionId}>
                  <div>
                    <p className="field-hint">
                      {item.kind === 'LECTURER_MATERIAL'
                        ? 'Học liệu giảng viên'
                        : 'Tài liệu sinh viên bổ sung'}{' '}
                      · {materialTypes[item.materialType]} · Phiên bản {item.versionNo}
                    </p>
                    <h3>{item.title}</h3>
                    <p>{item.authors || 'Chưa ghi tác giả'}</p>
                    <p className="field-hint">
                      {item.courses.map((c) => `${c.code} · ${c.name}`).join('; ')}
                    </p>
                    <p className="field-hint">
                      {item.pageCount} trang ·{' '}
                      {item.downloadAllowed ? 'Được tải bản gốc' : 'Chỉ đọc trong hệ thống'}
                    </p>
                  </div>
                  <Link
                    className="primary-button"
                    href={`/workspace/library/versions/${item.versionId}`}
                    aria-label={`Đọc ${item.title}`}
                  >
                    Đọc tài liệu
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="users-pagination">
            <button
              id="library-previous"
              className="secondary-button"
              disabled={query.page === 1}
              onClick={() => navigate({ ...query, page: query.page - 1 })}
            >
              Trang trước
            </button>
            <button
              id="library-next"
              className="secondary-button"
              disabled={data.page * data.limit >= data.total}
              onClick={() => navigate({ ...query, page: query.page + 1 })}
            >
              Trang sau
            </button>
          </div>
        </>
      )}
    </section>
  );
}
