'use client';

import { useEffect, useRef } from 'react';

export type CitationStatus = 'copying' | 'copied' | 'manual';

export function ReaderCitation({
  text,
  status,
  onCopy,
  onSave,
  onClose,
  saveDisabled,
}: {
  text: string;
  status: CitationStatus;
  onCopy: () => void;
  onSave: () => void;
  onClose: () => void;
  saveDisabled: boolean;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, [text]);
  return (
    <section
      className="reader-citation"
      aria-label="Trích dẫn đoạn chọn"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <p role="status">
        {status === 'copying'
          ? 'Đang sao chép trích dẫn…'
          : status === 'copied'
            ? 'Đã sao chép trích dẫn.'
            : 'Chưa sao chép được. Chọn nội dung rồi dùng Ctrl+C hoặc menu Sao chép của thiết bị.'}
      </p>
      <label className="form-field">
        Nội dung trích dẫn
        <textarea ref={input} readOnly value={text} rows={5} />
      </label>
      <p className="field-hint">
        Liên kết mở đúng phiên bản và trang PDF; người mở cần đăng nhập và có quyền đọc.
      </p>
      <div className="note-actions">
        <button className="secondary-button" disabled={status === 'copying'} onClick={onCopy}>
          Sao chép lại trích dẫn
        </button>
        <button
          className="secondary-button"
          onClick={() => {
            input.current?.focus();
            input.current?.select();
          }}
        >
          Chọn nội dung trích dẫn
        </button>
        <button className="secondary-button" disabled={saveDisabled} onClick={onSave}>
          Lưu đoạn vào ghi chú
        </button>
        <button className="quiet-button" onClick={onClose}>
          Đóng trích dẫn
        </button>
      </div>
    </section>
  );
}
