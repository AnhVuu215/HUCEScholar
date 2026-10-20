'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  createReport,
  myReports,
  reportCategories,
  reportError,
  reportStatuses,
  type MyReport,
  type ReportCategory,
} from '../../lib/reports';
import { useNotesLeaveGuard } from './use-notes-leave-guard';

/** Report a problem with this exact version and follow the result of the reader's own reports. */
export function ReaderReport({ versionId }: { versionId: string }) {
  const [open, setOpen] = useState(false),
    [category, setCategory] = useState<ReportCategory | ''>(''),
    [description, setDescription] = useState('');
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [items, setItems] = useState<MyReport[] | null>(null),
    [listError, setListError] = useState(false),
    [attempt, setAttempt] = useState(0);
  const field = useRef<HTMLSelectElement>(null),
    feedback = useRef<HTMLParagraphElement>(null),
    // The trigger unmounts while the form is open; focus the re-rendered one on cancel.
    trigger = useRef<HTMLButtonElement>(null);
  useNotesLeaveGuard(
    open && Boolean(category || description.trim()),
    pending,
    'Bạn có báo cáo đang soạn chưa gửi. Rời trang và bỏ nội dung này?',
  );
  useEffect(() => {
    const controller = new AbortController();
    myReports(versionId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setItems(result);
          setListError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setListError(true);
      });
    return () => controller.abort();
  }, [versionId, attempt]);
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);
  function close() {
    setOpen(false);
    setCategory('');
    setDescription('');
    setError('');
    requestAnimationFrame(() => trigger.current?.focus());
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!category || !description.trim()) {
      setError('Chọn loại vấn đề và mô tả ngắn để quản trị viên kiểm tra.');
      requestAnimationFrame(() => feedback.current?.focus());
      return;
    }
    setPending(true);
    setError('');
    try {
      const report = await createReport(versionId, category, description.trim());
      setItems((current) => [report, ...(current ?? [])]);
      setOpen(false);
      setCategory('');
      setDescription('');
      setNotice('Đã gửi báo cáo. Tài liệu vẫn hiển thị cho tới khi quản trị viên xử lý.');
      requestAnimationFrame(() => feedback.current?.focus());
    } catch (failure) {
      setError(reportError(failure));
      requestAnimationFrame(() => feedback.current?.focus());
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="reader-report" aria-labelledby="reader-report-title">
      <h3 id="reader-report-title" className="sr-only">
        Báo cáo tài liệu
      </h3>
      {!open && (
        <button
          ref={trigger}
          type="button"
          className="text-button"
          onClick={() => {
            setNotice('');
            setOpen(true);
          }}
        >
          Báo cáo vấn đề với tài liệu
        </button>
      )}
      {notice && (
        <p role="status" ref={feedback} tabIndex={-1}>
          {notice}
        </p>
      )}
      {open && (
        <form className="note-editor" onSubmit={(event) => void submit(event)} noValidate>
          <p className="field-hint">
            Báo cáo gắn với phiên bản đang đọc, chỉ quản trị viên xem. Không đính kèm ghi chú riêng
            của bạn.
          </p>
          <label htmlFor="report-category">Loại vấn đề</label>
          <select
            ref={field}
            id="report-category"
            value={category}
            disabled={pending}
            onChange={(e) => setCategory(e.target.value as ReportCategory | '')}
          >
            <option value="">Chọn loại vấn đề</option>
            {Object.entries(reportCategories).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label htmlFor="report-description">Mô tả</label>
          <textarea
            id="report-description"
            rows={3}
            maxLength={2000}
            value={description}
            readOnly={pending}
            aria-describedby="report-description-hint"
            onChange={(e) => setDescription(e.target.value)}
          />
          <p id="report-description-hint" className="field-hint">
            Ví dụ: trang nào bị lỗi, thông tin nào sai. {description.length}/2000 ký tự.
          </p>
          {error && (
            <p role="alert" ref={feedback} tabIndex={-1} className="form-error">
              {error}
            </p>
          )}
          <div className="note-actions">
            <button className="primary-button" disabled={pending}>
              {pending ? 'Đang gửi…' : 'Gửi báo cáo'}
            </button>
            <button type="button" className="secondary-button" disabled={pending} onClick={close}>
              Hủy báo cáo
            </button>
          </div>
        </form>
      )}
      {listError && (
        <p className="field-hint">
          Chưa tải được báo cáo bạn đã gửi.{' '}
          <button type="button" className="text-button" onClick={() => setAttempt((n) => n + 1)}>
            Tải lại
          </button>
        </p>
      )}
      {!!items?.length && (
        <ul className="report-list" aria-label="Báo cáo bạn đã gửi cho phiên bản này">
          {items.map((report) => (
            <li key={report.id}>
              <strong>{reportCategories[report.category]}</strong> · {reportStatuses[report.status]}
              <span className="field-hint">
                {' '}
                · Gửi {new Date(report.createdAt).toLocaleString('vi-VN')}
              </span>
              {report.result && <p className="field-hint">Phản hồi: {report.result}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
