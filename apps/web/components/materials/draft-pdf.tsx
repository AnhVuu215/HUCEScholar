'use client';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/auth';
import {
  canRecheckPdf,
  currentDraft,
  recheckDraftPdf,
  fileErrorMessage,
  materialError,
  uploadDraftPdf,
  type MaterialDraft,
} from '../../lib/materials';
import { ScanWatchHint, useScanWatch } from './scan-watch';

export function DraftPdf({
  current,
  metadataDirty,
  interactionBlocked = false,
  changed,
  watched,
  busy,
  selectionChanged,
}: {
  current: MaterialDraft;
  metadataDirty: boolean;
  interactionBlocked?: boolean;
  changed: (item: MaterialDraft) => void;
  /** Automatic status updates; must keep metadata being edited. */
  watched: (item: MaterialDraft) => void;
  busy: (value: boolean) => void;
  selectionChanged: (value: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const watch = useScanWatch(current, current.fileState === 'CHECKING', watched);
  const feedback = useRef<HTMLParagraphElement>(null);
  const states = {
    MISSING: 'Chưa có PDF',
    CHECKING: 'PDF đang kiểm tra',
    SAFE: 'PDF đã qua kiểm tra kỹ thuật',
    FAILED: 'PDF không đạt kiểm tra',
  };
  const blocked = metadataDirty || interactionBlocked || !current.editable || pending;
  function fail(message: string) {
    setError(message);
    requestAnimationFrame(() => feedback.current?.focus());
  }
  async function recheck() {
    if (blocked) return;
    setPending(true);
    busy(true);
    setError('');
    setNotice('');
    try {
      changed(await recheckDraftPdf(current));
      watch.refreshed();
      setNotice('Đang kiểm tra lại đúng file đã tải lên. Kết quả sẽ hiển thị tại đây.');
    } catch (failure) {
      fail(materialError(failure));
    } finally {
      setPending(false);
      busy(false);
    }
  }
  async function run(upload: boolean) {
    if (blocked || (upload && (!file || uncertain))) return;
    setPending(true);
    busy(true);
    setError('');
    setNotice('');
    try {
      const item = upload ? await uploadDraftPdf(current, file!) : await currentDraft(current.id);
      changed(item);
      watch.refreshed();
      setUncertain(false);
      setNotice(
        upload
          ? 'PDF đã được lưu riêng tư. Kết quả kiểm tra sẽ hiển thị tại đây.'
          : 'Đã cập nhật trạng thái từ máy chủ.',
      );
      if (upload || uncertain) {
        setFile(null);
        selectionChanged(false);
        if (input.current) input.current.value = '';
      }
    } catch (failure) {
      if (upload && (!(failure instanceof ApiError) || failure.status >= 500)) {
        setUncertain(true);
        fail('');
      } else if (failure instanceof ApiError && failure.code === 'PDF_TOO_LARGE')
        fail('PDF vượt giới hạn dung lượng. Chọn file tối đa 25 MiB.');
      else if (failure instanceof ApiError && failure.code === 'INVALID_PDF')
        fail('File không phải PDF hợp lệ. Chọn lại tài liệu PDF.');
      else if (failure instanceof ApiError && failure.code === 'UPLOAD_BUSY')
        fail('Đang có lượt tải lên. Giữ file đã chọn và thử lại sau.');
      else fail(materialError(failure));
    } finally {
      setPending(false);
      busy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(true);
  }
  return (
    <section className="draft-pdf" aria-labelledby="draft-pdf-title">
      <h3 id="draft-pdf-title">PDF của bản nháp</h3>
      <p role="status">{states[current.fileState]}</p>
      {current.fileState === 'CHECKING' && <ScanWatchHint watch={watch} />}
      {current.pdf && (
        <p className="field-hint draft-file-name">
          {current.pdf.name} · {(current.pdf.byteSize / 1024 / 1024).toFixed(2)} MiB
          {current.pdf.pageCount ? ` · ${current.pdf.pageCount} trang` : ''}
        </p>
      )}
      <p className="field-hint">
        PDF được lưu riêng tư. Qua kiểm tra kỹ thuật chưa đồng nghĩa được duyệt hoặc công bố.
      </p>
      {current.fileState === 'FAILED' && (
        <p className="field-hint">{fileErrorMessage(current.fileError)}</p>
      )}
      {canRecheckPdf(current) && (
        <button
          type="button"
          className="secondary-button"
          disabled={blocked}
          onClick={() => void recheck()}
        >
          Kiểm tra lại
        </button>
      )}
      {current.fileState === 'SAFE' && current.pdf?.copyRestricted && (
        <p className="field-hint">
          PDF này cấm sao chép nội dung. Người đọc vẫn đọc và ghi chú theo trang được, nhưng không
          tô sáng hay trích dẫn đoạn chữ.
        </p>
      )}
      {(error || uncertain) && (
        <p role="alert" ref={feedback} tabIndex={-1} className="form-error">
          {uncertain && (
            <>
              Chưa xác nhận được kết quả upload. Bấm Cập nhật trạng thái trước khi chọn file và thử
              lại.{' '}
            </>
          )}
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="user-success">
          {notice}
        </p>
      )}
      {metadataDirty && (
        <p className="field-hint">
          Lưu thay đổi thông tin rồi mở lại bản nháp trước khi tải PDF lên hoặc cập nhật trạng thái.
        </p>
      )}
      {file && (
        <button
          type="button"
          className="text-button"
          disabled={pending}
          onClick={() => {
            setFile(null);
            selectionChanged(false);
            setError('');
            if (input.current) input.current.value = '';
          }}
        >
          Bỏ file đã chọn
        </button>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={blocked} className="draft-fields">
          <legend className="sr-only">Đính kèm PDF</legend>
          <div className="form-field">
            <label htmlFor="draft-pdf-input">Chọn PDF</label>
            <input
              ref={input}
              id="draft-pdf-input"
              type="file"
              accept=".pdf,application/pdf"
              aria-describedby="pdf-file-hint"
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setError('');
                setNotice('');
                if (
                  selected &&
                  (!/\.pdf$/i.test(selected.name) ||
                    !selected.size ||
                    selected.size > 25 * 1024 * 1024)
                ) {
                  event.target.value = '';
                  setFile(null);
                  selectionChanged(false);
                  fail('Chọn một PDF có dung lượng từ 1 byte đến 25 MiB.');
                  return;
                }
                setFile(selected);
                selectionChanged(!!selected);
              }}
            />
            <p id="pdf-file-hint" className="field-hint">
              Tối đa 25 MiB. PDF mới thay file đính kèm hiện tại và phải được kiểm tra lại.
            </p>
          </div>
          <div className="user-form-actions">
            <button type="submit" className="primary-button" disabled={!file || uncertain}>
              {pending ? 'Đang xử lý…' : 'Tải PDF lên'}
            </button>
            <button type="button" className="secondary-button" onClick={() => void run(false)}>
              Cập nhật trạng thái
            </button>
          </div>
        </fieldset>
      </form>
      {pending && <p role="status">Đang xử lý PDF. Giữ trang này mở tới khi có kết quả lưu.</p>}
    </section>
  );
}
