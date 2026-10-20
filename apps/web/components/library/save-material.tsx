'use client';
import { useEffect, useRef, useState } from 'react';
import { changeSaved, savedStatus } from '../../lib/personal-library';
import { libraryError } from '../../lib/library';
import { useReturnFocus } from '../../lib/use-return-focus';
export function SaveMaterial({
  documentId,
  initiallySaved,
  changed,
}: {
  documentId: string;
  initiallySaved?: boolean;
  changed?: (notice: string) => void;
}) {
  const returnFocus = useReturnFocus();
  const [saved, setSaved] = useState<boolean | null>(initiallySaved ?? null);
  const [pending, setPending] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [confirm, setConfirm] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const alive = useRef(true),
    feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    if (initiallySaved === undefined)
      void savedStatus(documentId, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setSaved(value);
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setError(libraryError(e));
            setUncertain(true);
          }
        });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [documentId, initiallySaved]);
  async function run(refresh: boolean) {
    if (pending || (!refresh && (uncertain || saved === null))) return;
    setPending(true);
    setError('');
    setNotice('');
    setConfirm(false);
    try {
      const value = refresh ? await savedStatus(documentId) : await changeSaved(documentId, !saved);
      if (!alive.current) return;
      setSaved(value);
      setUncertain(false);
      const message = value
        ? 'Đã lưu vào thư viện của bạn.'
        : 'Chưa lưu trong thư viện. Ghi chú và tiến độ được giữ nguyên.';
      setNotice(message);
      if (changed) changed(message);
      else requestAnimationFrame(() => feedback.current?.focus());
    } catch (e) {
      if (alive.current) {
        setError(libraryError(e));
        setUncertain(true);
        requestAnimationFrame(() => feedback.current?.focus());
      }
    } finally {
      if (alive.current) setPending(false);
    }
  }
  return (
    <div className="saved-control">
      {error && (
        <p role="alert" ref={feedback} tabIndex={-1} className="form-error">
          {error} Tải trạng thái lưu để đối chiếu trước khi thử lại.
        </p>
      )}
      {notice && (
        <p role="status" ref={feedback} tabIndex={-1}>
          {notice}
        </p>
      )}
      <button
        type="button"
        className="secondary-button"
        disabled={pending || uncertain || saved === null}
        onClick={() => {
          if (!saved) return void run(false);
          returnFocus.remember();
          setConfirm(true);
        }}
      >
        {saved === null ? 'Đang kiểm tra lưu…' : saved ? 'Bỏ lưu tài liệu' : 'Lưu tài liệu'}
      </button>
      {uncertain && (
        <button
          type="button"
          className="secondary-button"
          disabled={pending}
          onClick={() => void run(true)}
        >
          Tải trạng thái lưu
        </button>
      )}
      {confirm && (
        <div className="publication-confirm">
          <p>Chỉ bỏ khỏi danh sách đã lưu của bạn. Ghi chú và tiến độ đọc vẫn được giữ.</p>
          <div className="user-form-actions">
            <button
              type="button"
              className="primary-button"
              disabled={pending}
              onClick={() => void run(false)}
            >
              Xác nhận bỏ lưu
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setConfirm(false);
                returnFocus.restore();
              }}
            >
              Giữ tài liệu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
