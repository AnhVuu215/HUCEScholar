'use client';
import { useEffect, useRef, useState } from 'react';
export function MaterialFilePicker({
  file,
  changed,
  disabled,
}: {
  file: File | null;
  changed: (file: File | null) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!file && input.current) input.current.value = '';
  }, [file]);
  return (
    <div className="form-field draft-wide">
      <label htmlFor="draft-material-file">File tài liệu (PDF hoặc DOCX)</label>
      <input
        ref={input}
        id="draft-material-file"
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={disabled}
        aria-describedby="material-file-hint"
        onChange={(event) => {
          const selected = event.target.files?.[0] ?? null;
          setError('');
          if (
            selected &&
            (!/\.(pdf|docx)$/i.test(selected.name) ||
              !selected.size ||
              selected.size > 25 * 1024 * 1024 ||
              selected.name.length > 255)
          ) {
            setError('Chọn PDF hoặc DOCX từ 1 byte đến 25 MiB, tên tối đa 255 ký tự.');
            event.target.value = '';
            changed(null);
            return;
          }
          changed(selected);
        }}
      />
      <p id="material-file-hint" className="field-hint">
        Tối đa 25 MiB. Word sẽ được chuyển thành PDF để đọc và ghi chú trên web; file Word gốc được
        giữ lại. Có thể lưu bản nháp chưa có file.
      </p>
      {file && (
        <p className="draft-file-name">
          Đã chọn: {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MiB{' '}
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() => {
              changed(null);
              setError('');
            }}
          >
            Bỏ file đã chọn
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
