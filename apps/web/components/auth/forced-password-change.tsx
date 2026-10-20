'use client';

import { useEffect, useState } from 'react';
import {
  ApiError,
  apiRequest,
  csrfToken,
  readProfile,
  workspacePath,
  type Profile,
} from '../../lib/auth';
import { ChangePasswordForm } from './change-password-form';

type State = { kind: 'loading' } | { kind: 'ready'; user: Profile } | { kind: 'error' };

/** Shown until an account replaces the password issued by an administrator. */
export function ForcedPasswordChange() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    apiRequest('/auth/me', { signal: controller.signal })
      .then(readProfile)
      .then((user) => {
        if (controller.signal.aborted) return;
        if (user.mustChangePassword) setState({ kind: 'ready', user });
        else window.location.replace(workspacePath(user.role));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) window.location.replace('/login');
        else setState({ kind: 'error' });
      });
    return () => controller.abort();
  }, [attempt]);

  async function logout() {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError('');
    try {
      const token = await csrfToken();
      await apiRequest('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': token } });
      window.location.replace('/login');
    } catch {
      setLogoutError('Chưa đăng xuất được. Kiểm tra kết nối rồi thử lại.');
      setLogoutPending(false);
    }
  }

  if (state.kind === 'loading')
    return (
      <p role="status" className="auth-description">
        Đang kiểm tra phiên đăng nhập…
      </p>
    );
  if (state.kind === 'error')
    return (
      <>
        <p role="alert" className="form-error">
          Chưa kiểm tra được phiên đăng nhập. Kiểm tra kết nối rồi thử lại.
        </p>
        <button
          className="primary-button"
          onClick={() => {
            setState({ kind: 'loading' });
            setAttempt((value) => value + 1);
          }}
        >
          Thử lại
        </button>
      </>
    );
  return (
    <>
      <p className="auth-description">
        Tài khoản <strong>{state.user.email}</strong> đang dùng mật khẩu do quản trị viên cấp. Đặt
        mật khẩu mới chỉ bạn biết để tiếp tục.
      </p>
      <ChangePasswordForm
        forced
        onChanged={() => window.location.replace(workspacePath(state.user.role))}
      />
      {logoutError && (
        <p role="alert" className="form-error">
          {logoutError}
        </p>
      )}
      <button
        type="button"
        className="secondary-button"
        disabled={logoutPending}
        onClick={() => void logout()}
      >
        {logoutPending ? 'Đang đăng xuất…' : 'Đăng xuất'}
      </button>
    </>
  );
}
