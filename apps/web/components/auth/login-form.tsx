'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, apiRequest, csrfToken, landingPath, readProfile } from '../../lib/auth';

export function LoginForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const token = await csrfToken();
      const response = await apiRequest('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      const user = await readProfile(response);
      window.location.replace(landingPath(user));
    } catch (failure) {
      const messages: Record<number, string> = {
        400: 'Kiểm tra email và mật khẩu rồi thử lại.',
        401: 'Email hoặc mật khẩu không đúng. Kiểm tra thông tin rồi thử lại.',
        403: 'Phiên biểu mẫu đã thay đổi. Bấm Đăng nhập để thử lại.',
        429: 'Bạn đã thử quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.',
        503: 'Đăng nhập tạm thời gián đoạn. Vui lòng thử lại sau.',
      };
      setError(
        failure instanceof ApiError
          ? (messages[failure.status] ?? 'Đăng nhập chưa thành công. Vui lòng thử lại sau.')
          : 'Không kết nối được hệ thống. Kiểm tra kết nối rồi bấm Đăng nhập để thử lại.',
      );
      setPending(false);
      submitting.current = false;
    }
  }

  return (
    <form onSubmit={submit} aria-busy={pending} className="login-form">
      <div className="form-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          maxLength={254}
          required
          aria-describedby="email-hint"
          spellCheck={false}
          autoCapitalize="none"
        />
        <p id="email-hint" className="field-hint">
          Dùng email được quản trị viên cấp hoặc xác minh.
        </p>
      </div>
      <div className="form-field">
        <label htmlFor="password">Mật khẩu</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          required
        />
      </div>
      {error && (
        <p ref={errorRef} role="alert" tabIndex={-1} className="form-error">
          {error}
        </p>
      )}
      <button type="submit" className="primary-button login-submit" disabled={pending}>
        {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
      <span role="status" className="sr-only">
        {pending ? 'Đang xác thực tài khoản, vui lòng chờ.' : ''}
      </span>
    </form>
  );
}
