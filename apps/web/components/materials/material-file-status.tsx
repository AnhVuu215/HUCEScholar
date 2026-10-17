'use client';
import { useEffect, useRef, useState } from 'react';
import {
  currentDraft,
  materialError,
  retryDraftSource,
  type MaterialDraft,
} from '../../lib/materials';

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
    [busy, setBusy] = useState(false),
    [stopped, setStopped] = useState(false);
  const callback = useRef(changed);
  useEffect(() => {
    callback.current = changed;
  }, [changed]);
  const source = current.source;
  const waiting = source
    ? ['QUEUED', 'RUNNING'].includes(source.conversionState)
    : current.fileState === 'CHECKING';
  useEffect(() => {
    if (!waiting || stopped) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 2000;
    const controller = new AbortController(),
      started = Date.now();
    const poll = async () => {
      if (controller.signal.aborted) return;
      if (Date.now() - started > 180_000) {
        setStopped(true);
        return;
      }
      if (document.visibilityState === 'visible')
        try {
          const item = await currentDraft(current.id, controller.signal);
          if (!controller.signal.aborted && item.versionId === current.versionId)
            callback.current(item);
        } catch {
          /* Manual refresh remains available; never overwrite the local form. */
        }
      if (!controller.signal.aborted) {
        delay = Math.min(delay * 1.5, 15000);
        timer = setTimeout(() => void poll(), delay);
      }
    };
    timer = setTimeout(() => void poll(), delay);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [current.id, current.versionId, source?.id, waiting, stopped]);
  async function refresh(retry = false) {
    if (busy || blocked) return;
    setBusy(true);
    setError('');
    try {
      const item = retry ? await retryDraftSource(current) : await currentDraft(current.id);
      changed(item);
      setStopped(false);
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
              FAILED: 'PDF không đạt kiểm tra; chọn file khác hoặc liên hệ quản trị viên',
            }[current.fileState]
          }
        </p>
      )}
      {current.pdf && (
        <p className="field-hint draft-file-name">
          {current.pdf.name} · {current.pdf.pageCount ?? '…'} trang
        </p>
      )}
      {source?.conversionState === 'READY' && (
        <p className="field-hint">
          Bản đọc được chuyển từ Word. Kiểm tra bố cục, công thức và hình ảnh trước khi công bố; bản
          chuyển đổi có thể khác Word.
        </p>
      )}
      <div className="user-form-actions">
        {waiting && !stopped && (
          <button type="button" className="text-button" onClick={() => setStopped(true)}>
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
      {waiting && (
        <p className="field-hint">
          File đã lưu riêng tư, chưa công bố.{' '}
          {stopped
            ? 'Đã dừng chờ tự động; bấm cập nhật để kiểm tra.'
            : 'Trạng thái tự cập nhật trong ba phút khi trang đang mở.'}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
