'use client';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, apiRequest, csrfToken } from '../../lib/auth';

async function post(path: string, body: object) {
  const token = await csrfToken();
  return apiRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify(body),
  });
}

/** Step 1: ask for a link. The answer is the same whether or not the address has an account. */
export function RecoveryRequestForm() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const feedback = useRef<HTMLParagraphElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Nhập email của tài khoản.');
      return;
    }
    setPending(true);
    try {
      const response = await post('/auth/password-recovery', { email: email.trim() });
      const body: unknown = await response.json();
      setNotice(
        body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
          ? body.message
          : 'Nếu email thuộc một tài khoản đang hoạt động, thư hướng dẫn sẽ đến trong vài phút.',
      );
      setEmail('');
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === 'RECOVERY_UNAVAILABLE'
          ? 'Hệ thống chưa gửi được thư khôi phục. Liên hệ quản trị viên để được cấp lại mật khẩu.'
          : failure instanceof ApiError && failure.status === 429
            ? 'Bạn đã yêu cầu quá nhiều lần. Chờ 15 phút rồi thử lại.'
            : 'Chưa gửi được yêu cầu. Kiểm tra kết nối rồi thử lại.',
      );
    } finally {
      setPending(false);
      requestAnimationFrame(() => feedback.current?.focus());
    }
  }
  return (
    <form onSubmit={submit} noValidate className="recovery-form">
      <div className="form-field">
        <label htmlFor="recovery-email">Email tài khoản</label>
        <input
          id="recovery-email"
          type="email"
          autoComplete="email"
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {(error || notice) && (
        <p
          ref={feedback}
          tabIndex={-1}
          role={error ? 'alert' : 'status'}
          className={error ? 'form-error' : 'user-success'}
        >
          {error || notice}
        </p>
      )}
      <button className="primary-button" disabled={pending}>
        {pending ? 'Đang gửi…' : 'Gửi liên kết đặt lại'}
      </button>
    </form>
  );
}

/** Step 2: the token is read from the URL fragment only when submitting, never sent elsewhere. */
export function PasswordResetForm() {
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      setError('Liên kết không đầy đủ. Mở lại liên kết trong thư hoặc yêu cầu liên kết mới.');
      return;
    }
    if (Array.from(next).length < 16 || next.length > 128) {
      setError('Mật khẩu mới cần ít nhất 16 ký tự Unicode, tối đa 128 đơn vị UTF-16.');
      return;
    }
    if (next !== confirmation) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setPending(true);
    try {
      await post('/auth/password-recovery/complete', { token, newPassword: next });
      window.history.replaceState(window.history.state, '', window.location.pathname);
      setNext('');
      setConfirmation('');
      setDone(true);
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === 'RESET_TOKEN_INVALID'
          ? 'Liên kết không hợp lệ hoặc đã hết hạn. Yêu cầu liên kết mới.'
          : failure instanceof ApiError && failure.status === 400
            ? 'Mật khẩu mới không hợp lệ. Kiểm tra độ dài rồi thử lại.'
            : failure instanceof ApiError && failure.status === 429
              ? 'Bạn đã thử quá nhiều lần. Chờ 15 phút rồi thử lại.'
              : 'Chưa xác nhận được kết quả. Thử đăng nhập bằng mật khẩu mới; nếu không được, yêu cầu liên kết mới.',
      );
    } finally {
      setPending(false);
    }
  }
  if (done)
    return (
      <div className="recovery-form">
        <p role="status" className="user-success">
          Đã đặt mật khẩu mới. Mọi phiên đăng nhập cũ đã kết thúc.
        </p>
        <Link className="primary-button" href="/login">
          Đăng nhập
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit} noValidate className="recovery-form">
      <p className="field-hint">
        Mật khẩu mới cần ít nhất 16 ký tự Unicode, tối đa 128 đơn vị UTF-16. Khoảng trắng được giữ
        nguyên.
      </p>
      <div className="form-field">
        <label htmlFor="reset-new">Mật khẩu mới</label>
        <input
          id="reset-new"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label htmlFor="reset-confirm">Nhập lại mật khẩu mới</label>
        <input
          id="reset-confirm"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={pending}>
        {pending ? 'Đang lưu…' : 'Đặt mật khẩu mới'}
      </button>
      <Link className="project-link" href="/forgot-password">
        Yêu cầu liên kết mới
      </Link>
    </form>
  );
}
