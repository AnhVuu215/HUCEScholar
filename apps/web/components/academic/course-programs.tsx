'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/auth';
import { academicError, academicWrite, currentCatalog, type CatalogItem } from '../../lib/academic';
import { CatalogPicker, type CatalogChoice } from './catalog-picker';

export function CoursePrograms({
  course,
  onClose,
  onSaved,
}: {
  course: CatalogItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [current, setCurrent] = useState<CatalogItem | null>(null);
  const [programs, setPrograms] = useState<CatalogChoice[]>([]);
  const [selected, setSelected] = useState<CatalogChoice | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [stale, setStale] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const failure = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const controller = new AbortController();
    async function load() {
      try {
        const item = await currentCatalog('courses', course.id, controller.signal);
        if (!controller.signal.aborted) {
          setCurrent(item);
          setPrograms(
            item.programs!.map((p) => ({
              id: p.id,
              label: `${p.code} · ${p.name}${p.active ? '' : ' (ngừng sử dụng)'}`,
            })),
          );
          setError('');
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(academicError(error));
      }
    }
    void load();
    return () => controller.abort();
  }, [course.id, attempt]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!current || pending || stale) return;
    setPending(true);
    setError('');
    try {
      await academicWrite(
        `/admin/catalog/courses/${course.id}/programs`,
        { revision: current.revision, programIds: programs.map((p) => p.id) },
        'PATCH',
      );
      onSaved();
    } catch (error) {
      setError(academicError(error));
      setStale(error instanceof ApiError && error.code === 'STALE_REVISION');
      requestAnimationFrame(() => failure.current?.focus());
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="user-editor" aria-labelledby="course-programs-title">
      <h2 id="course-programs-title" ref={heading} tabIndex={-1}>
        Ngành sử dụng {course.code}
      </h2>
      <p className="field-hint">
        {course.name}. Một môn có thể dùng chung ở các ngành thuộc nhiều khoa. Tối đa 100 ngành/môn
        trong MVP.
      </p>
      {error && (
        <p ref={failure} role="alert" tabIndex={-1} className="form-error">
          {error}
        </p>
      )}
      {!current ? (
        <>
          <p role="status">Đang tải liên kết ngành…</p>
          {error && (
            <button className="secondary-button" onClick={() => setAttempt((v) => v + 1)}>
              Tải lại liên kết
            </button>
          )}
          <button className="text-button" onClick={onClose}>
            Hủy
          </button>
        </>
      ) : (
        <form onSubmit={save}>
          <fieldset disabled={pending || stale} className="user-fields">
            <legend className="sr-only">Các ngành sử dụng môn</legend>
            <div>
              <CatalogPicker
                kind="programs"
                label="Ngành sử dụng"
                required={false}
                value={selected}
                onChange={setSelected}
              />
              <button
                className="secondary-button"
                type="button"
                disabled={
                  !selected || programs.length >= 100 || programs.some((p) => p.id === selected.id)
                }
                onClick={() => {
                  if (selected) {
                    setPrograms([...programs, selected]);
                    setSelected(null);
                  }
                }}
              >
                Thêm vào danh sách
              </button>
            </div>
            <div>
              <h3>Các ngành đã chọn</h3>
              {!programs.length ? (
                <p className="field-hint">Môn chưa gắn với ngành nào.</p>
              ) : (
                <ul className="catalog-linked-list">
                  {programs.map((p) => (
                    <li key={p.id}>
                      <span>{p.label}</span>
                      <button
                        type="button"
                        className="text-button"
                        aria-label={`Gỡ ${p.label}`}
                        onClick={() => setPrograms(programs.filter((item) => item.id !== p.id))}
                      >
                        Gỡ
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </fieldset>
          <div className="user-form-actions">
            <button className="primary-button" disabled={pending || stale}>
              {pending ? 'Đang lưu…' : 'Lưu liên kết'}
            </button>
            <button className="secondary-button" type="button" disabled={pending} onClick={onClose}>
              Hủy
            </button>
            {stale && (
              <button className="text-button" type="button" onClick={onClose}>
                Đóng và chọn lại môn
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
