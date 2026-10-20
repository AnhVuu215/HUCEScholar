'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ApiError } from '../../lib/auth';
import {
  accountPreferences,
  updatePreferences,
  defaultReaderPreferences,
  readerZooms,
  type PreferencesSnapshot,
  type ReaderPreferences,
} from '../../lib/account';
import { useWorkspaceProfile } from '../auth/workspace-profile-context';
import { HighlightPalette } from '../library/highlight-palette';
import { SelectField } from '../ui/select-field';
import { useNotesLeaveGuard } from '../library/use-notes-leave-guard';

export function ReaderPreferencesForm() {
  const { user } = useWorkspaceProfile();
  return <PreferencesEditor key={user.id} userId={user.id} />;
}
function PreferencesEditor({ userId }: { userId: string }) {
  const [saved, setSaved] = useState<PreferencesSnapshot | null>(null),
    [draft, setDraft] = useState<ReaderPreferences>({ ...defaultReaderPreferences });
  const [pending, setPending] = useState(false),
    [blocked, setBlocked] = useState(false),
    [expired, setExpired] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const alive = useRef(true),
    feedback = useRef<HTMLParagraphElement>(null),
    sending = useRef(false);
  const dirty = Boolean(
    saved &&
    (draft.highlightColor !== saved.preferences.highlightColor ||
      draft.defaultZoom !== saved.preferences.defaultZoom ||
      draft.annotationPanelOpen !== saved.preferences.annotationPanelOpen),
  );
  useNotesLeaveGuard(dirty, pending, 'Bạn có cài đặt đọc chưa lưu. Rời trang và bỏ thay đổi?');
  useEffect(() => {
    if (error || notice) feedback.current?.focus();
  }, [error, notice]);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void accountPreferences(userId, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setSaved(value);
        setDraft(value.preferences);
        setError('');
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setError('Chưa tải được cài đặt. Thử tải lại.');
          if (failure instanceof ApiError && failure.status === 401) setExpired(true);
        }
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [userId, attempt]);
  async function run(refresh: boolean) {
    if (sending.current || (!refresh && (!saved || blocked || expired))) return;
    sending.current = true;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const value = refresh
        ? await accountPreferences(userId)
        : await updatePreferences(userId, draft, saved!.revision);
      if (!alive.current) return;
      setSaved(value);
      setBlocked(false);
      if (!refresh) setDraft(value.preferences);
      setNotice(
        refresh
          ? 'Đã đối chiếu với máy chủ. Bản chọn được giữ để bạn kiểm tra.'
          : 'Đã lưu cài đặt đọc. Áp dụng khi mở tài liệu hoặc tạo vùng tô mới.',
      );
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ApiError && failure.status === 401) {
        setExpired(true);
        setError('Phiên đăng nhập không còn hợp lệ. Đăng nhập lại để tiếp tục.');
      } else {
        setBlocked(true);
        setError(
          failure instanceof ApiError && failure.status === 409
            ? 'Cài đặt đã thay đổi ở lượt khác. Tải lại để đối chiếu; bản chọn được giữ.'
            : 'Chưa xác nhận được cài đặt. Tải lại để đối chiếu trước khi lưu tiếp.',
        );
      }
    } finally {
      sending.current = false;
      if (alive.current) setPending(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(false);
  }
  return (
    <section className="content-section profile-editor" aria-label="Tùy chọn trình đọc">
      <h2>Tùy chọn trình đọc</h2>
      <p>
        Áp dụng mặc định khi mở tài liệu hoặc tạo vùng tô mới. Không đổi màu vùng tô đã lưu hoặc lựa
        chọn đang dùng trong tài liệu đang mở.
      </p>
      {error && (
        <p ref={feedback} tabIndex={-1} role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && (
        <p ref={feedback} tabIndex={-1} role="status">
          {notice}
        </p>
      )}
      {expired ? (
        <Link href="/login">Đăng nhập lại</Link>
      ) : !saved ? (
        <>
          {error ? (
            <button className="secondary-button" onClick={() => setAttempt((value) => value + 1)}>
              Tải lại cài đặt
            </button>
          ) : (
            <p role="status">Đang tải cài đặt…</p>
          )}
        </>
      ) : (
        <form onSubmit={submit}>
          <HighlightPalette
            label="Màu tô mặc định"
            value={draft.highlightColor}
            disabled={pending}
            onChange={(highlightColor) => {
              setDraft((value) => ({ ...value, highlightColor }));
              setNotice('');
            }}
          />
          <div className="form-field">
            <SelectField
              id="preferences-zoom"
              label="Mức phóng mặc định"
              value={draft.defaultZoom}
              disabled={pending}
              options={Object.entries(readerZooms).map(([value, label]) => ({ value, label }))}
              onChange={(value) => {
                setDraft((current) => ({
                  ...current,
                  defaultZoom: value as ReaderPreferences['defaultZoom'],
                }));
                setNotice('');
              }}
            />
          </div>
          <label className="preferences-checkbox">
            <input
              type="checkbox"
              checked={draft.annotationPanelOpen}
              disabled={pending}
              onChange={(event) => {
                setDraft((value) => ({ ...value, annotationPanelOpen: event.target.checked }));
                setNotice('');
              }}
            />
            Mở bảng ghi chú khi vào tài liệu
          </label>
          {blocked && (
            <>
              <p className="field-hint">
                Cài đặt máy chủ: {readerZooms[saved.preferences.defaultZoom]},{' '}
                {saved.preferences.annotationPanelOpen ? 'mở' : 'đóng'} bảng ghi chú. Bấm tải lại để
                lấy bản mới nhất.
              </p>
              <button
                type="button"
                className="secondary-button"
                disabled={pending}
                onClick={() => void run(true)}
              >
                Tải lại để đối chiếu cài đặt
              </button>
            </>
          )}
          <div className="user-form-actions">
            <button className="primary-button control-form" disabled={pending || blocked || !dirty}>
              {pending ? 'Đang lưu…' : 'Lưu cài đặt đọc'}
            </button>
            <button
              type="button"
              className="secondary-button control-form"
              disabled={pending || !dirty}
              onClick={() => {
                setDraft(saved.preferences);
                setNotice('');
              }}
            >
              Hủy cài đặt đang chọn
            </button>
            <button
              type="button"
              className="secondary-button control-form"
              disabled={pending}
              onClick={() => {
                setDraft({ ...defaultReaderPreferences });
                setNotice('Mặc định mới chỉ được chọn. Bấm Lưu cài đặt đọc để xác nhận.');
              }}
            >
              Khôi phục mặc định
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
