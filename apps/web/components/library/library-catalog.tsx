'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { libraryError, libraryList, libraryCourses, type LibraryList } from '../../lib/library';
import { materialTypes } from '../../lib/materials';
import { Button } from '../ui/button';
import { SelectField } from '../ui/select-field';
export function LibraryCatalog() {
  const [query, setQuery] = useState({
    search: '',
    courseId: '',
    kind: '',
    materialType: '',
    page: 1,
  });
  const [search, setSearch] = useState(''),
    [courseId, setCourseId] = useState(''),
    [kind, setKind] = useState(''),
    [materialType, setType] = useState('');
  const [data, setData] = useState<LibraryList | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const [courses, setCourses] = useState<{ id: string; code: string; name: string }[]>([]),
    [courseError, setCourseError] = useState(false);
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
    setData(null);
    setError('');
    setQuery({ search, courseId, kind, materialType, page: 1 });
  }
  return (
    <section className="content-section" aria-labelledby="library-results">
      <form className="users-filters library-filters" onSubmit={submit}>
        <div className="form-field">
          <label htmlFor="library-search">Tìm học liệu</label>
          <input
            id="library-search"
            value={search}
            maxLength={200}
            placeholder="Tiêu đề hoặc tác giả"
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
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </div>
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
        <Button type="submit" variant="primary" size="form">
          Tìm kiếm
        </Button>
      </form>
      {courseError && (
        <p role="alert">
          Chưa tải được bộ lọc môn. Bạn vẫn có thể tìm theo tiêu đề.{' '}
          <button className="secondary-button" onClick={() => setAttempt((n) => n + 1)}>
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
          <button className="secondary-button" onClick={() => setAttempt((n) => n + 1)}>
            Thử lại
          </button>
        </div>
      ) : !data ? (
        <p role="status">Đang tìm học liệu…</p>
      ) : (
        <>
          <p role="status">
            {data.total} học liệu · Trang {data.page}
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
              className="secondary-button"
              disabled={query.page === 1}
              onClick={() => {
                setData(null);
                setQuery((q) => ({ ...q, page: q.page - 1 }));
              }}
            >
              Trang trước
            </button>
            <button
              className="secondary-button"
              disabled={data.page * data.limit >= data.total}
              onClick={() => {
                setData(null);
                setQuery((q) => ({ ...q, page: q.page + 1 }));
              }}
            >
              Trang sau
            </button>
          </div>
        </>
      )}
    </section>
  );
}
