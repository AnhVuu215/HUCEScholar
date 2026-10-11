'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  currentDraft,
  draftCourses,
  materialError,
  materialTypes,
  saveDraft,
  type DraftFields,
  type MaterialDraft,
} from '../../lib/materials';
import { CatalogPicker, type CatalogChoice } from '../academic/catalog-picker';
import { DraftPdf } from './draft-pdf';

export function MaterialEditor({
  id,
  close,
  saved,
  updated,
}: {
  id?: string;
  close: () => void;
  saved: () => void;
  updated: (item: MaterialDraft) => void;
}) {
  const [initial, setInitial] = useState<MaterialDraft | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void currentDraft(id, controller.signal)
      .then((item) => {
        if (!controller.signal.aborted) {
          setInitial(item);
          setLoading(false);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setError(materialError(failure));
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [id, attempt]);
  if (loading || error)
    return (
      <section className="user-editor" aria-label="Mở bản nháp">
        {loading ? (
          <p role="status">Đang tải bản nháp…</p>
        ) : (
          <>
            <p role="alert" className="form-error">
              {error}
            </p>
            <button
              className="secondary-button"
              onClick={() => {
                setError('');
                setLoading(true);
                setAttempt((v) => v + 1);
              }}
            >
              Thử mở bản nháp
            </button>
          </>
        )}
        <button className="text-button" onClick={close}>
          Đóng bản nháp
        </button>
      </section>
    );
  return <DraftForm initial={initial} close={close} saved={saved} updated={updated} />;
}
function fieldsFor(initial: MaterialDraft | null): DraftFields {
  return {
    title: initial?.title ?? '',
    authors: initial?.authors ?? '',
    description: initial?.description ?? '',
    materialType: initial?.materialType ?? 'LECTURE',
    sourceReference: initial?.sourceReference ?? '',
    rightsBasis: initial?.rightsBasis ?? '',
    downloadAllowed: initial?.downloadAllowed ?? false,
    courseIds: initial?.courses.map((c) => c.id) ?? [],
  };
}
function DraftForm({
  initial,
  close,
  saved,
  updated,
}: {
  initial: MaterialDraft | null;
  close: () => void;
  saved: () => void;
  updated: (item: MaterialDraft) => void;
}) {
  const [current, setCurrent] = useState(initial);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfSelected, setPdfSelected] = useState(false);
  const [fields, setFields] = useState(() => fieldsFor(initial));
  const [courses, setCourses] = useState<CatalogChoice[]>(
    () =>
      initial?.courses.map((c) => ({
        id: c.id,
        label: `${c.code} · ${c.name}${c.active ? '' : ' (đã ngừng)'}`,
      })) ?? [],
  );
  const [choice, setChoice] = useState<CatalogChoice | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  const [logoutButton, setLogoutButton] = useState<HTMLButtonElement | null>(null);
  const leaveAllowed = useRef(false);
  const discardPrompt = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  const metadataDirty = JSON.stringify(fields) !== JSON.stringify(fieldsFor(current));
  const dirty = metadataDirty || pdfSelected || pdfBusy;
  const editable = !current || current.editable;
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => {
      if (leaveAllowed.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const navigate = (event: MouseEvent) => {
      if (
        leaveAllowed.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      const logout =
        event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>('button[data-workspace-logout]')
          : null;
      if (
        !logout &&
        (!link ||
          link.target === '_blank' ||
          link.hasAttribute('download') ||
          link.origin !== window.location.origin ||
          (link.pathname === window.location.pathname && link.search === window.location.search))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (pdfBusy) return;
      setDestination(logout ? null : link!.href);
      setLogoutButton(logout);
      setConfirm(true);
      requestAnimationFrame(() => discardPrompt.current?.focus());
    };
    window.addEventListener('beforeunload', leave);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', leave);
      document.removeEventListener('click', navigate, true);
    };
  }, [dirty, pdfBusy]);
  function update<K extends keyof DraftFields>(key: K, value: DraftFields[K]) {
    leaveAllowed.current = false;
    setFields((v) => ({ ...v, [key]: value }));
    setConfirm(false);
    setDestination(null);
    setLogoutButton(null);
  }
  function fail(message: string) {
    setError(message);
    requestAnimationFrame(() => errorMessage.current?.focus());
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || pdfBusy || !editable) return;
    if (!fields.courseIds.length) {
      fail('Thêm ít nhất một môn học liên quan trước khi lưu.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await saveDraft(fields, current ?? undefined);
      saved();
    } catch (failure) {
      fail(materialError(failure));
      setPending(false);
    }
  }
  return (
    <section className="user-editor" aria-labelledby="draft-editor-title">
      <h2 id="draft-editor-title" ref={heading} tabIndex={-1}>
        {initial ? 'Thông tin bản nháp' : 'Bản nháp mới'}
      </h2>
      <p className="field-hint">
        {current ? `Phiên bản ${current.versionNo} · Lần lưu ${current.revision}. ` : ''}Lưu thông
        tin trước khi thêm PDF. Bản nháp chỉ xuất hiện trong không gian của bạn.
      </p>
      {!editable && (
        <p role="alert" className="form-error">
          {current?.editBlock === 'ASSIGNMENT_REQUIRED'
            ? 'Bạn không còn phân công hợp lệ ở tất cả môn liên quan. Metadata được giữ lại; cần quản trị viên kiểm tra phân công trước khi sửa.'
            : 'Phiên bản không còn ở trạng thái nháp, không thể sửa tại đây.'}
        </p>
      )}
      {error && (
        <p role="alert" ref={errorMessage} tabIndex={-1} className="form-error">
          {error}
        </p>
      )}
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={pending || pdfBusy || !editable} className="draft-fields">
          <legend className="sr-only">Metadata học liệu</legend>
          <div className="user-fields">
            <div className="form-field draft-wide">
              <label htmlFor="draft-title">Tiêu đề học liệu</label>
              <input
                id="draft-title"
                required
                maxLength={300}
                value={fields.title}
                onChange={(e) => update('title', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="draft-authors">
                Tác giả <span className="field-hint">(không bắt buộc)</span>
              </label>
              <input
                id="draft-authors"
                maxLength={500}
                value={fields.authors}
                onChange={(e) => update('authors', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="draft-type">Loại học liệu</label>
              <select
                id="draft-type"
                value={fields.materialType}
                onChange={(e) =>
                  update('materialType', e.target.value as DraftFields['materialType'])
                }
              >
                {Object.entries(materialTypes).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field draft-wide">
              <label htmlFor="draft-description">
                Mô tả <span className="field-hint">(không bắt buộc)</span>
              </label>
              <textarea
                id="draft-description"
                maxLength={1500}
                value={fields.description}
                onChange={(e) => update('description', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="draft-source">Nguồn tài liệu</label>
              <textarea
                id="draft-source"
                required
                maxLength={1000}
                aria-describedby="source-hint"
                value={fields.sourceReference}
                onChange={(e) => update('sourceReference', e.target.value)}
              />
              <p id="source-hint" className="field-hint">
                Ghi nguồn xuất bản, đường dẫn nguồn hoặc tài liệu do bạn biên soạn.
              </p>
            </div>
            <div className="form-field">
              <label htmlFor="draft-rights">Căn cứ quyền sử dụng</label>
              <textarea
                id="draft-rights"
                required
                maxLength={1000}
                aria-describedby="rights-hint"
                value={fields.rightsBasis}
                onChange={(e) => update('rightsBasis', e.target.value)}
              />
              <p id="rights-hint" className="field-hint">
                Ghi giấy phép, sự cho phép của tác giả hoặc căn cứ bạn có quyền chia sẻ.
              </p>
            </div>
          </div>
          <div className="draft-courses">
            <h3>Môn liên quan</h3>
            <p className="field-hint">
              Thêm từ 1 đến 20 môn. Giảng viên chỉ chọn môn được phân công hiện hành.
            </p>
            <ul className="catalog-linked-list" aria-label="Các môn đã chọn">
              {courses.map((c) => (
                <li key={c.id}>
                  <span>{c.label}</span>
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Gỡ môn ${c.label}`}
                    onClick={() => {
                      setCourses((v) => v.filter((item) => item.id !== c.id));
                      update(
                        'courseIds',
                        fields.courseIds.filter((id) => id !== c.id),
                      );
                    }}
                  >
                    Gỡ
                  </button>
                </li>
              ))}
            </ul>
            {!courses.length && <p className="field-hint">Chưa thêm môn liên quan.</p>}
            <CatalogPicker
              kind="courses"
              label="Môn học liên quan"
              value={choice}
              onChange={setChoice}
              required={false}
              loadItems={draftCourses}
            />
            <button
              type="button"
              className="secondary-button"
              disabled={!choice || courses.some((c) => c.id === choice.id) || courses.length >= 20}
              onClick={() => {
                if (choice) {
                  setCourses((v) => [...v, choice]);
                  update('courseIds', [...fields.courseIds, choice.id]);
                  setChoice(null);
                }
              }}
            >
              Thêm môn
            </button>
          </div>
          <label className="eligibility-check">
            <input
              type="checkbox"
              checked={fields.downloadAllowed}
              onChange={(e) => update('downloadAllowed', e.target.checked)}
            />
            <span>Đề nghị cho phép tải sau khi được duyệt</span>
          </label>
          <p className="field-hint">
            Lựa chọn này chưa cấp quyền tải. Gửi duyệt và công bố là các bước tiếp theo.
          </p>
        </fieldset>
        {confirm && (
          <div
            className="draft-discard"
            role="group"
            ref={discardPrompt}
            tabIndex={-1}
            aria-label="Xác nhận bỏ thay đổi"
          >
            <p>Bỏ thay đổi chưa lưu?</p>
            {logoutButton && (
              <p className="field-hint">Bạn sẽ đăng xuất. Những thay đổi chưa lưu sẽ bị bỏ.</p>
            )}
            <div className="user-form-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={pending}
                onClick={() => {
                  setConfirm(false);
                  setDestination(null);
                  setLogoutButton(null);
                  heading.current?.focus();
                }}
              >
                Tiếp tục sửa
              </button>
              <button
                type="button"
                className="text-button"
                disabled={pending}
                onClick={() => {
                  if (logoutButton) {
                    leaveAllowed.current = true;
                    setFields(fieldsFor(initial));
                    setCourses(
                      initial?.courses.map((c) => ({
                        id: c.id,
                        label: `${c.code} · ${c.name}${c.active ? '' : ' (đã ngừng)'}`,
                      })) ?? [],
                    );
                    setConfirm(false);
                    logoutButton.click();
                  } else if (destination) {
                    leaveAllowed.current = true;
                    window.location.assign(destination);
                  } else close();
                }}
              >
                Bỏ thay đổi
              </button>
            </div>
          </div>
        )}
        <div className="user-form-actions">
          {editable && (
            <button className="primary-button" disabled={pending || pdfBusy || pdfSelected}>
              {pending ? 'Đang lưu…' : 'Lưu bản nháp'}
            </button>
          )}
          <button
            type="button"
            className="secondary-button"
            disabled={pending || pdfBusy}
            onClick={() => {
              setDestination(null);
              setLogoutButton(null);
              if (dirty) {
                setConfirm(true);
                requestAnimationFrame(() => discardPrompt.current?.focus());
              } else close();
            }}
          >
            Đóng bản nháp
          </button>
        </div>
      </form>
      {current && (
        <DraftPdf
          current={current}
          metadataDirty={metadataDirty || pending}
          changed={(item) => {
            updated(item);
            setCurrent(item);
            setFields(fieldsFor(item));
            setCourses(
              item.courses.map((c) => ({
                id: c.id,
                label: `${c.code} · ${c.name}${c.active ? '' : ' (đã ngừng)'}`,
              })),
            );
          }}
          busy={setPdfBusy}
          selectionChanged={setPdfSelected}
        />
      )}
    </section>
  );
}
