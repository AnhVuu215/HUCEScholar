'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { saveUser, userError, type ManagedUser } from '../../lib/users';

export function PasswordReset({
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
        await saveUser(`/admin/users/${user.id}/password`, 'POST', {
          password: form.get('password'),
          revision: user.revision,
        }),
      );
    } catch (error) {
      setFailure(userError(error));
      setPending(false);
    }
  }
  return (
    <section className="user-editor" aria-labelledby="password-reset-title">
      <h2 id="password-reset-title" tabIndex={-1} ref={heading}>
        Cấp lại mật khẩu
      </h2>
      <p className="confirmation-identity">
        <strong>{user.displayName}</strong>
        <br />
        {user.email}
      </p>
      <p className="field-hint">
        Người dùng bị đăng xuất trên mọi thiết bị, mật khẩu cũ không còn dùng được và phải đổi mật
        khẩu tạm này ở lần đăng nhập tiếp theo.
      </p>
      <form onSubmit={(event) => void submit(event)} aria-busy={pending}>
        <fieldset disabled={pending} className="user-fields">
          <legend className="sr-only">Mật khẩu tạm</legend>
          <div className="form-field">
            <label htmlFor="reset-password">Mật khẩu tạm</label>
            <input
              id="reset-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={16}
              maxLength={128}
              required
              aria-describedby="reset-password-guidance"
            />
            <p id="reset-password-guidance" className="field-hint">
              16–128 ký tự. Chuyển mật khẩu cho người nhận qua kênh riêng.
            </p>
          </div>
        </fieldset>
        {failure.message && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="form-error">
            {failure.message}
          </p>
        )}
        <div className="user-form-actions">
          <button className="primary-button" disabled={pending || failure.stale} type="submit">
            {pending ? 'Đang lưu…' : 'Cấp lại mật khẩu'}
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
