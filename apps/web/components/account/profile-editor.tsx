'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, roleLabels } from '../../lib/auth';
import { accountProfile, updateProfile, type AccountProfile } from '../../lib/account';
import { useWorkspaceProfile } from '../auth/workspace-profile-context';
import { useNotesLeaveGuard } from '../library/use-notes-leave-guard';

export function ProfileEditor() {
  const { update: updateShell } = useWorkspaceProfile();
  const [saved, setSaved] = useState<AccountProfile | null>(null),
    [name, setName] = useState('');
  const [pending, setPending] = useState(false),
    [blocked, setBlocked] = useState(false),
    [expired, setExpired] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [attempt, setAttempt] = useState(0);
  const alive = useRef(true),
    feedback = useRef<HTMLParagraphElement>(null);
  const dirty = Boolean(saved && name !== saved.displayName);
  useNotesLeaveGuard(dirty, pending, 'Bạn có thay đổi hồ sơ chưa lưu. Rời trang và bỏ thay đổi?');
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void accountProfile(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setSaved(value);
        setName(value.displayName);
        setError('');
        updateShell(value);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Chưa tải được hồ sơ. Kiểm tra kết nối rồi thử lại.');
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [attempt, updateShell]);
  function focusFeedback() {
    requestAnimationFrame(() => feedback.current?.focus());
  }
  async function reconcile() {
    if (pending) return;
    setPending(true);
    setNotice('');
    try {
      const value = await accountProfile();
      if (!alive.current) return;
      setSaved(value);
      updateShell(value);
      setBlocked(false);
      setError('');
      setNotice('Đã đối chiếu với máy chủ. Bản soạn được giữ để bạn kiểm tra.');
    } catch {
      if (alive.current) setError('Chưa đối chiếu được hồ sơ. Bản soạn vẫn được giữ.');
    } finally {
      if (alive.current) {
        setPending(false);
        focusFeedback();
      }
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!saved || pending || blocked || expired || !name.trim()) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const value = await updateProfile(name, saved.revision);
      if (!alive.current) return;
      setSaved(value);
      setName(value.displayName);
      updateShell(value);
      setNotice('Đã lưu tên hiển thị.');
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ApiError && failure.status === 400)
        setError('Tên hiển thị cần từ1 đến150 ký tự.');
      else if (failure instanceof ApiError && failure.status === 401) {
        setExpired(true);
        setError('Phiên đăng nhập không còn hợp lệ. Đăng nhập lại để tiếp tục.');
      } else {
        setBlocked(true);
        setError(
          failure instanceof ApiError && failure.status === 409
            ? 'Thông tin đã thay đổi. Tải lại để đối chiếu; bản soạn vẫn được giữ.'
            : 'Chưa xác nhận được kết quả lưu. Tải lại để đối chiếu trước khi gửi tiếp.',
        );
      }
    } finally {
      if (alive.current) {
        setPending(false);
        focusFeedback();
      }
    }
  }
  if (!saved)
    return (
      <section className="content-section">
        <h2>Tài khoản của bạn</h2>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="secondary-button" onClick={() => setAttempt((value) => value + 1)}>
              Tải lại hồ sơ
            </button>
          </>
        ) : (
          <p role="status">Đang tải hồ sơ…</p>
        )}
      </section>
    );
  return (
    <section className="content-section profile-editor" aria-labelledby="account-title">
      <h2 id="account-title">Tài khoản của bạn</h2>
      <div className="profile-summary">
        <span className="workspace-avatar" aria-hidden="true">
          {Array.from(saved.displayName)[0]?.toLocaleUpperCase('vi')}
        </span>
        <p>{saved.displayName}</p>
      </div>
      <dl className="scope-list">
        <div>
          <dt>Email</dt>
          <dd>{saved.email}</dd>
        </div>
        <div>
          <dt>Vai trò</dt>
          <dd>{roleLabels[saved.role]}</dd>
        </div>
      </dl>
      <p className="field-hint">Email và vai trò do quản trị viên quản lý.</p>
      <form onSubmit={submit}>
        <div className="form-field">
          <label htmlFor="profile-name">Tên hiển thị</label>
          <input
            id="profile-name"
            autoComplete="name"
            required
            maxLength={150}
            value={name}
            disabled={pending || expired}
            onChange={(event) => {
              setName(event.target.value);
              setNotice('');
            }}
          />
        </div>
        <p className="field-hint">Tên hiển thị trên tài khoản và trong không gian của bạn.</p>
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
        {blocked && (
          <>
            <p>
              Máy chủ hiện ghi nhận: <strong>{saved.displayName}</strong>
            </p>
            <button
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={() => void reconcile()}
            >
              Tải lại để đối chiếu
            </button>
          </>
        )}
        {expired ? (
          <Link href="/login">Đăng nhập lại</Link>
        ) : (
          <div className="user-form-actions">
            <button
              className="primary-button control-form"
              disabled={!dirty || pending || blocked || !name.trim()}
            >
              {pending ? 'Đang lưu…' : 'Lưu tên'}
            </button>
            <button
              type="button"
              className="secondary-button control-form"
              disabled={!dirty || pending}
              onClick={() => {
                setName(saved.displayName);
                setNotice('');
              }}
            >
              Hủy thay đổi
            </button>
          </div>
        )}
      </form>
      <p>
        <Link href="/workspace/settings">Bảo mật và cài đặt</Link>
      </p>
    </section>
  );
}
