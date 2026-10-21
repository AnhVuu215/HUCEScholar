'use client';
import { useState } from 'react';
import {
  currentDraft,
  fileErrorMessage,
  materialError,
  retryDraftSource,
  type MaterialDraft,
} from '../../lib/materials';
import { ScanWatchHint, useScanWatch } from './scan-watch';

export function MaterialFileStatus({
  current,
  changed,
  blocked,
}: {
  current: MaterialDraft;
  changed: (item: MaterialDraft) => void;
  blocked: boolean;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const source = current.source;
  const waiting = source
    ? ['QUEUED', 'RUNNING'].includes(source.conversionState)
    : current.fileState === 'CHECKING';
  const watch = useScanWatch(current, waiting, changed);
  async function refresh(retry = false) {
    if (busy || blocked) return;
    setBusy(true);
    setError('');
    try {
      const item = retry ? await retryDraftSource(current) : await currentDraft(current.id);
      changed(item);
      watch.refreshed();
    } catch (failure) {
      setError(materialError(failure));
    } finally {
      setBusy(false);
    }
  }
  const scanLabels = {
    CHECKING: 'Đang kiểm tra an toàn',
    SAFE: 'Đã qua kiểm tra an toàn',
    FAILED: 'Không đạt kiểm tra an toàn',
  };
  const conversionLabels = {
    QUEUED: 'Đang chờ chuyển PDF',
    RUNNING: 'Đang tạo bản đọc PDF',
    READY: 'Bản đọc PDF đã sẵn sàng',
    FAILED: 'Chưa tạo được bản đọc PDF',
    CANCELLED: 'Đã dừng xử lý nguồn này',
  };
  return (
    <section className="draft-pdf" aria-label="Trạng thái file tài liệu">
      <h3>File đã lưu</h3>
      {source ? (
        <>
          <p className="draft-file-name">
            {source.name} · {(source.byteSize / 1024 / 1024).toFixed(2)} MiB
          </p>
          <p role="status">
            Nguồn Word: {scanLabels[source.scanState]}. {conversionLabels[source.conversionState]}.
          </p>
          {source.conversionState === 'FAILED' && (
            <p className="field-hint">
              {['INVALID_DOCX', 'SCAN_FAILED'].includes(source.errorCode ?? '')
                ? 'File lỗi, có mã hóa hoặc không đạt kiểm tra. Chọn một bản DOCX khác.'
                : 'Dịch vụ chuyển đổi chưa hoàn thành. Bạn có thể thử xử lý lại hoặc thay file.'}
            </p>
          )}
        </>
      ) : (
        <p role="status">
          {
            {
              MISSING: 'Chưa có file tài liệu',
              CHECKING: 'PDF đang kiểm tra an toàn',
              SAFE: 'PDF đã qua kiểm tra an toàn',
              FAILED: `PDF không đạt kiểm tra. ${fileErrorMessage(current.fileError)}`,
            }[current.fileState]
          }
        </p>
      )}
      {current.pdf && (
        <p className="field-hint draft-file-name">
          {current.pdf.name} · {current.pdf.pageCount ?? '…'} trang
        </p>
      )}
      {current.fileState === 'SAFE' && current.pdf?.copyRestricted && (
        <p className="field-hint">
          PDF này cấm sao chép nội dung. Người đọc vẫn đọc và ghi chú theo trang được, nhưng không
          tô sáng hay trích dẫn đoạn chữ.
        </p>
      )}
      {source?.conversionState === 'READY' && (
        <p className="field-hint">
          Bản đọc được chuyển từ Word. Kiểm tra bố cục, công thức và hình ảnh trước khi công bố; bản
          chuyển đổi có thể khác Word.
        </p>
      )}
      <div className="user-form-actions">
        {waiting && !watch.stopped && (
          <button type="button" className="text-button" onClick={watch.stop}>
            Dừng chờ tự động
          </button>
        )}
        {current.fileState === 'SAFE' && current.reviewStatus === 'DRAFT' && (
          <a
            className="secondary-button"
            href={`/api/v1/material-drafts/${current.id}/preview`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Xem trước bản PDF
          </a>
        )}
        <button
          type="button"
          className="secondary-button"
          disabled={busy || blocked}
          onClick={() => void refresh()}
        >
          Cập nhật trạng thái file
        </button>
        {source?.conversionState === 'FAILED' &&
          ['PROCESSOR_UNAVAILABLE', 'CONVERSION_TIMEOUT', 'CONVERSION_FAILED'].includes(
            source.errorCode ?? '',
          ) &&
          current.editable && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy || blocked}
              onClick={() => void refresh(true)}
            >
              Thử chuyển PDF lại
            </button>
          )}
      </div>
      {waiting && <ScanWatchHint watch={watch} />}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
