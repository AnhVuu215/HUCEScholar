'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { libraryList, type LibraryItem } from '../../lib/library';
import { draftCourses, materialTypes } from '../../lib/materials';
import {
  myReadingList,
  readingListError,
  saveReadingList,
  type ReadingList,
} from '../../lib/reading-lists';
import { SelectField } from '../ui/select-field';

type Row = {
  key: string;
  section: string;
  note: string;
  /** `YYYY-MM-DD` from the date input, or '' for no due date. */
  dueOn: string;
  versionId: string;
  label: string;
};
type Loaded = { revision: number; title: string; published: boolean; rows: Row[] };
const MAX_ITEMS = 100;

function fromList(list: ReadingList | null): Loaded {
  return {
    revision: list?.revision ?? 0,
    title: list?.title ?? '',
    published: list?.published ?? false,
    rows: (list?.items ?? []).map((i) => ({
      key: `${i.versionId}-${i.position}`,
      section: i.section,
      note: i.note,
      dueOn: i.dueOn ?? '',
      versionId: i.versionId,
      label: i.material
        ? `${i.material.title} · phiên bản ${i.material.versionNo}`
        : 'Tài liệu không còn khả dụng — bỏ mục này trước khi lưu',
    })),
  };
}

/** The signed-in lecturer's own list for one assigned course; the API enforces assignment. */
export function ReadingListEditor() {
  const [courses, setCourses] = useState<{ id: string; code: string; name: string }[] | null>(null);
  const [courseId, setCourseId] = useState('');
  const [form, setForm] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<LibraryItem[] | null>(null);
  const [searchError, setSearchError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void draftCourses(new URLSearchParams({ limit: '100' }), controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setCourses(result.items);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(readingListError(failure));
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!courseId) return;
    const controller = new AbortController();
    void myReadingList(courseId, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setForm(fromList(list));
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(readingListError(failure));
      });
    return () => controller.abort();
  }, [courseId, attempt]);
  function choose(value: string) {
    setForm(null);
    setError('');
    setNotice('');
    setResults(null);
    setCourseId(value);
  }
  function update(change: (rows: Row[]) => Row[]) {
    setForm((f) => (f ? { ...f, rows: change(f.rows) } : f));
    setNotice('');
  }
  function move(index: number, by: -1 | 1) {
    update((rows) => {
      const next = [...rows];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  }
  async function find(event: FormEvent) {
    event.preventDefault();
    setSearchError('');
    setResults(null);
    try {
      const list = await libraryList(
        new URLSearchParams({ courseId, search: search.trim(), limit: '10' }),
        AbortSignal.timeout(8000),
      );
      setResults(list.items);
    } catch (failure) {
      setSearchError(readingListError(failure));
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await saveReadingList(courseId, {
        title: form.title,
        published: form.published,
        revision: form.revision,
        items: form.rows.map((r) => ({
          section: r.section,
          note: r.note,
          versionId: r.versionId,
          dueOn: r.dueOn || null,
        })),
      });
      setForm(fromList(saved));
      setNotice(
        saved.published
          ? 'Đã lưu. Người đọc của môn thấy danh sách này.'
          : 'Đã lưu bản nháp. Người đọc chưa thấy danh sách.',
      );
    } catch (failure) {
      setError(readingListError(failure));
    } finally {
      setSaving(false);
    }
  }
  const chosen = new Set(form?.rows.map((r) => r.versionId));
  return (
    <section className="users-directory reading-lists" aria-labelledby="reading-editor-title">
      <h2 id="reading-editor-title">Soạn danh sách đọc</h2>
      <p className="field-hint">
        Mỗi môn bạn được phân công có một danh sách. Mỗi mục giữ đúng phiên bản bạn chọn; khi tài
        liệu có bản mới, người đọc thấy gợi ý và bạn tự quyết định đổi. Hạn đọc hiện trên lịch học
        của người đọc đã chọn theo dõi môn.
      </p>
      {!courses ? (
        error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : (
          <p role="status">Đang tải môn được phân công…</p>
        )
      ) : courses.length === 0 ? (
        <p className="users-list-message">Bạn chưa được phân công môn nào.</p>
      ) : (
        <SelectField
          id="reading-editor-course"
          label="Môn được phân công"
          value={courseId}
          onChange={choose}
          options={[
            { value: '', label: 'Chọn môn' },
            ...courses.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
          ]}
        />
      )}
      {courseId && !form && !error && <p role="status">Đang tải danh sách…</p>}
      {courseId && !form && error && (
        <div className="users-list-message">
          <p role="alert" className="form-error">
            {error}
          </p>
          <button
            className="secondary-button"
            onClick={() => {
              setError('');
              setAttempt((v) => v + 1);
            }}
          >
            Thử tải lại
          </button>
        </div>
      )}
      {form && (
        <form className="reading-editor" onSubmit={save}>
          <div className="form-field">
            <label htmlFor="reading-title">Tên danh sách</label>
            <input
              id="reading-title"
              required
              maxLength={200}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <label className="eligibility-check">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
            />{' '}
            Công bố cho người đọc của môn
          </label>
          {form.rows.length === 0 ? (
            <p className="field-hint">Chưa có tài liệu. Tìm và thêm ở dưới.</p>
          ) : (
            <ol className="reading-editor-items">
              {form.rows.map((row, index) => (
                <li key={row.key}>
                  <p>{row.label}</p>
                  <div className="form-field">
                    <label htmlFor={`section-${row.key}`}>Tuần hoặc chủ đề</label>
                    <input
                      id={`section-${row.key}`}
                      maxLength={120}
                      value={row.section}
                      onChange={(e) =>
                        update((rows) =>
                          rows.map((r, i) => (i === index ? { ...r, section: e.target.value } : r)),
                        )
                      }
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`note-${row.key}`}>Ghi chú cho người đọc</label>
                    <input
                      id={`note-${row.key}`}
                      maxLength={500}
                      value={row.note}
                      onChange={(e) =>
                        update((rows) =>
                          rows.map((r, i) => (i === index ? { ...r, note: e.target.value } : r)),
                        )
                      }
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`due-${row.key}`}>Hạn đọc (không bắt buộc)</label>
                    <input
                      id={`due-${row.key}`}
                      type="date"
                      min="2000-01-01"
                      max="2100-12-31"
                      value={row.dueOn}
                      onChange={(e) =>
                        update((rows) =>
                          rows.map((r, i) => (i === index ? { ...r, dueOn: e.target.value } : r)),
                        )
                      }
                    />
                  </div>
                  <div className="reading-editor-actions">
                    <button
                      type="button"
                      className="text-button"
                      disabled={index === 0}
                      aria-label={`Đưa lên: ${row.label}`}
                      onClick={() => move(index, -1)}
                    >
                      Lên
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={index === form.rows.length - 1}
                      aria-label={`Đưa xuống: ${row.label}`}
                      onClick={() => move(index, 1)}
                    >
                      Xuống
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`Bỏ khỏi danh sách: ${row.label}`}
                      onClick={() => update((rows) => rows.filter((_, i) => i !== index))}
                    >
                      Bỏ
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          <button className="primary-button" disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu danh sách'}
          </button>
          {error && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setForm(null);
                setError('');
                setAttempt((v) => v + 1);
              }}
            >
              Tải lại từ máy chủ
            </button>
          )}
        </form>
      )}
      {form && (
        <form className="users-filters reading-search" onSubmit={find}>
          <div className="form-field">
            <label htmlFor="reading-search">Tìm tài liệu của môn để thêm</label>
            <input
              id="reading-search"
              type="search"
              maxLength={200}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="secondary-button">Tìm tài liệu</button>
          {searchError && (
            <p role="alert" className="form-error">
              {searchError}
            </p>
          )}
          {results && results.length === 0 && (
            <p className="field-hint">Không có tài liệu đã công bố phù hợp trong môn này.</p>
          )}
          {results && results.length > 0 && (
            <ul className="reading-results">
              {results.map((item) => (
                <li key={item.versionId}>
                  <span>
                    {item.title} · {materialTypes[item.materialType]} · phiên bản {item.versionNo}
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    disabled={chosen.has(item.versionId) || form.rows.length >= MAX_ITEMS}
                    aria-label={`Thêm vào danh sách: ${item.title}`}
                    onClick={() =>
                      update((rows) => [
                        ...rows,
                        {
                          key: `${item.versionId}-new`,
                          section: rows.at(-1)?.section ?? '',
                          note: '',
                          dueOn: '',
                          versionId: item.versionId,
                          label: `${item.title} · phiên bản ${item.versionNo}`,
                        },
                      ])
                    }
                  >
                    {chosen.has(item.versionId) ? 'Đã thêm' : 'Thêm'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
    </section>
  );
}
