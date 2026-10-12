'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { saveUser, userError, type ManagedUser } from '../../lib/users';

export function StatusConfirm({
  user,
  onSaved,
  onClose,
  onReload,
}: {
  user: ManagedUser;
  onSaved: (user: ManagedUser) => void;
  onClose: () => void;
  onReload: () => void;
}) {
  const locking = user.status === 'ACTIVE';
  const verifying = !user.verifiedAt;
  const label = locking
    ? 'Xác nhận khóa'
    : verifying
      ? 'Xác minh và kích hoạt'
      : 'Xác nhận mở khóa';
  const heading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState({ message: '', stale: false });
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (failure.message) errorRef.current?.focus();
  }, [failure]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setFailure({ message: '', stale: false });
    try {
      onSaved(
        await saveUser(`/admin/users/${user.id}/status`, 'PATCH', {
          status: locking ? 'LOCKED' : 'ACTIVE',
          revision: user.revision,
          ...(verifying ? { eligibilityConfirmed: form.get('eligible') === 'on' } : {}),
        }),
      );
    } catch (error) {
      setFailure(userError(error));
      setPending(false);
    }
  }
  return (
    <section className="user-editor" aria-labelledby="status-confirm-title">
      <h2 id="status-confirm-title" tabIndex={-1} ref={heading}>
        {label} tài khoản
      </h2>
      <p className="confirmation-identity">
        <strong>{user.displayName}</strong>
        <br />
        {user.email}
      </p>
      <p className="field-hint">
        {locking
          ? 'Người dùng sẽ bị đăng xuất trên mọi thiết bị và không thể đăng nhập cho đến khi được mở khóa.'
          : 'Người dùng có thể đăng nhập lại bằng email và mật khẩu hiện có. Các phiên đã thu hồi không được khôi phục.'}
      </p>
      <form onSubmit={(event) => void submit(event)} aria-busy={pending}>
        {verifying && (
          <label className="eligibility-check">
            <input type="checkbox" name="eligible" required disabled={pending} />{' '}
            <span>Tôi đã đối chiếu người dùng với danh sách hợp lệ.</span>
          </label>
        )}
        {failure.message && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="form-error">
            {failure.message}
          </p>
        )}
        <div className="user-form-actions">
          <button
            className={locking ? 'danger-button' : 'primary-button'}
            disabled={pending || failure.stale}
            type="submit"
          >
            {pending ? 'Đang lưu…' : label}
          </button>
          <button className="secondary-button" disabled={pending} type="button" onClick={onClose}>
            Hủy
          </button>
          {failure.stale && (
            <button className="secondary-button" type="button" onClick={onReload}>
              Đóng và tải lại danh sách
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
