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
const sent =
  'Đã nhận yêu cầu. Thư xác nhận sẽ đến email này trong vài phút; liên kết hết hạn sau 24 giờ.';

/** AUTH-04 step 1: only the email. The answer is the same whether or not it has an account. */
export function SignupRequestForm() {
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
      setError('Nhập email bạn dùng để nhận thư xác nhận.');
      requestAnimationFrame(() => feedback.current?.focus());
      return;
    }
    setPending(true);
    try {
      const response = await post('/auth/signup', { email: email.trim() });
      const body: unknown = await response.json();
      setNotice(
        body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
          ? body.message
          : sent,
      );
      setEmail('');
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === 'SIGNUP_UNAVAILABLE'
          ? 'Hệ thống chưa gửi được thư xác nhận. Liên hệ quản trị viên để được cấp tài khoản.'
          : failure instanceof ApiError && failure.status === 429
            ? 'Bạn đã yêu cầu quá nhiều lần. Chờ 15 phút rồi thử lại.'
            : failure instanceof ApiError && failure.status === 400
              ? 'Email chưa hợp lệ.'
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
        <label htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
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
        {pending ? 'Đang gửi…' : 'Gửi thư xác nhận'}
      </button>
    </form>
  );
}

const roles = [
  ['STUDENT', 'Sinh viên', 'Đọc, ghi chú và gửi tài liệu bổ sung để kiểm duyệt.'],
  ['LECTURER', 'Giảng viên', 'Đăng và quản lý học liệu cho môn mình dạy.'],
] as const;

/**
 * AUTH-04 step 2, opened from the mailed link. The token is read from the URL fragment only
 * when submitting; whoever holds the mailbox chooses the name, role and password.
 */
export function SignupCompleteForm() {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'STUDENT' | 'LECTURER' | ''>('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const feedback = useRef<HTMLParagraphElement>(null);
  function fail(message: string) {
    setError(message);
    requestAnimationFrame(() => feedback.current?.focus());
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      return fail('Liên kết không đầy đủ. Mở lại liên kết trong thư hoặc đăng ký lại.');
    if (!name.trim()) return fail('Nhập tên hiển thị.');
    if (!role) return fail('Chọn vai trò của bạn.');
    if (Array.from(password).length < 16 || password.length > 128)
      return fail('Mật khẩu cần ít nhất 16 ký tự Unicode, tối đa 128 đơn vị UTF-16.');
    if (password !== confirmation) return fail('Mật khẩu xác nhận không khớp.');
    setPending(true);
    try {
      await post('/auth/signup/complete', { token, displayName: name.trim(), role, password });
      window.history.replaceState(window.history.state, '', window.location.pathname);
      setPassword('');
      setConfirmation('');
      setDone(true);
    } catch (failure) {
      fail(
        failure instanceof ApiError && failure.code === 'SIGNUP_TOKEN_INVALID'
          ? 'Liên kết không hợp lệ, đã dùng hoặc đã hết hạn. Đăng ký lại để nhận liên kết mới.'
          : failure instanceof ApiError && failure.code === 'SIGNUP_EMAIL_TAKEN'
            ? 'Email này đã có tài khoản. Đăng nhập hoặc dùng “Quên mật khẩu?”.'
            : failure instanceof ApiError && failure.status === 400
              ? 'Thông tin chưa hợp lệ. Kiểm tra tên (tối đa 150 ký tự) và độ dài mật khẩu.'
              : failure instanceof ApiError && failure.status === 429
                ? 'Bạn đã thử quá nhiều lần. Chờ 15 phút rồi thử lại.'
                : 'Chưa xác nhận được kết quả. Thử đăng nhập; nếu không được, đăng ký lại.',
      );
    } finally {
      setPending(false);
    }
  }
  if (done)
    return (
      <div className="recovery-form">
        <p role="status" className="user-success">
          Đã tạo tài khoản. Đăng nhập bằng email và mật khẩu vừa đặt.
        </p>
        <Link className="primary-button" href="/login">
          Đăng nhập
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit} noValidate className="recovery-form">
      <div className="form-field">
        <label htmlFor="signup-name">Tên hiển thị</label>
        <input
          id="signup-name"
          autoComplete="name"
          maxLength={150}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <fieldset className="signup-roles">
        <legend>Vai trò</legend>
        {roles.map(([value, label, hint]) => (
          <label key={value}>
            <input
              type="radio"
              name="signup-role"
              value={value}
              checked={role === value}
              onChange={() => setRole(value)}
            />
            <span>
              <strong>{label}</strong>
              <span className="field-hint">{hint}</span>
            </span>
          </label>
        ))}
        <p className="field-hint">Tài khoản quản trị chỉ do quản trị viên cấp.</p>
      </fieldset>
      <p className="field-hint">
        Mật khẩu cần ít nhất 16 ký tự Unicode, tối đa 128 đơn vị UTF-16. Khoảng trắng được giữ
        nguyên.
      </p>
      <div className="form-field">
        <label htmlFor="signup-password">Mật khẩu</label>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label htmlFor="signup-confirm">Nhập lại mật khẩu</label>
        <input
          id="signup-confirm"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
      </div>
      {error && (
        <p ref={feedback} tabIndex={-1} role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={pending}>
        {pending ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
      </button>
      <Link className="project-link" href="/signup">
        Đăng ký lại để nhận liên kết mới
      </Link>
    </form>
  );
}
