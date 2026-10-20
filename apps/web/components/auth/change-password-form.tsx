'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, changePassword } from '../../lib/auth';
import { useNotesLeaveGuard } from '../library/use-notes-leave-guard';
export function ChangePasswordForm({
  forced = false,
  onChanged,
}: {
  /** The account still uses a password issued by an administrator. */
  forced?: boolean;
  onChanged?: () => void;
} = {}) {
  const [current, setCurrent] = useState(''),
    [next, setNext] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState([false, false, false]);
  const [pending, setPending] = useState(false),
    [blocked, setBlocked] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const alive = useRef(true),
    sending = useRef(false),
    feedback = useRef<HTMLParagraphElement>(null),
    inputs = useRef<(HTMLInputElement | null)[]>([]);
  const rejectedField = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!error && !notice) return;
    if (error && rejectedField.current !== undefined)
      inputs.current[rejectedField.current]?.focus();
    else feedback.current?.focus();
  }, [error, notice]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useNotesLeaveGuard(
    Boolean(current || next || confirmation),
    pending,
    'Bạn có mật khẩu đang nhập chưa gửi. Rời trang và bỏ các trường này?',
  );
  function clear() {
    setCurrent('');
    setNext('');
    setConfirmation('');
    setVisible([false, false, false]);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || blocked) return;
    setError('');
    setNotice('');
    rejectedField.current = undefined;
    let validation = '',
      field = 1;
    if (!current || current.length > 128) {
      validation = `Nhập ${forced ? 'mật khẩu được cấp' : 'mật khẩu hiện tại'}, tối đa128 đơn vị UTF-16.`;
      field = 0;
    } else if (Array.from(next).length < 16 || next.length > 128)
      validation = 'Mật khẩu mới cần ít nhất16 ký tự Unicode, tối đa128 đơn vị UTF-16.';
    else if (next === current) validation = 'Mật khẩu mới phải khác mật khẩu hiện tại.';
    else if (next !== confirmation) {
      validation = 'Mật khẩu xác nhận không khớp.';
      field = 2;
    }
    if (validation) {
      setError(validation);
      inputs.current[field]?.focus();
      return;
    }
    sending.current = true;
    setPending(true);
    try {
      await changePassword(current, next);
      if (!alive.current) return;
      clear();
      setNotice('Đã đổi mật khẩu. Các phiên đăng nhập cũ đã kết thúc.');
      onChanged?.();
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ApiError && failure.status === 400) {
        setError(
          failure.code === 'INVALID_CURRENT_PASSWORD'
            ? forced
              ? 'Mật khẩu được cấp không đúng.'
              : 'Mật khẩu hiện tại không đúng.'
            : 'Mật khẩu mới không hợp lệ hoặc trùng mật khẩu hiện tại. Kiểm tra rồi thử lại.',
        );
        rejectedField.current = failure.code === 'INVALID_CURRENT_PASSWORD' ? 0 : 1;
      } else if (failure instanceof ApiError && failure.status === 429)
        setError('Bạn đã thử quá nhiều lần. Chờ15 phút trước khi thử lại.');
      else {
        clear();
        setBlocked(true);
        setError(
          failure instanceof ApiError && [401, 409].includes(failure.status)
            ? 'Thông tin đăng nhập không còn hợp lệ. Đăng nhập lại để tiếp tục.'
            : failure instanceof ApiError && failure.status === 403
              ? 'Yêu cầu bị từ chối. Đăng nhập lại để lấy phiên hợp lệ trước khi thử tiếp.'
              : 'Chưa xác nhận được kết quả đổi mật khẩu. Đăng nhập lại bằng mật khẩu phù hợp trước khi thử tiếp; biểu mẫu không tự gửi lại.',
        );
      }
    } finally {
      sending.current = false;
      if (alive.current) {
        setPending(false);
      }
    }
  }
  const fields = [
    {
      id: 'password-current',
      label: forced ? 'Mật khẩu được cấp' : 'Mật khẩu hiện tại',
      value: current,
      set: setCurrent,
      autocomplete: 'current-password',
    },
    {
      id: 'password-new',
      label: 'Mật khẩu mới',
      value: next,
      set: setNext,
      autocomplete: 'new-password',
    },
    {
      id: 'password-confirmation',
      label: 'Nhập lại mật khẩu mới',
      value: confirmation,
      set: setConfirmation,
      autocomplete: 'new-password',
    },
  ];
  return (
    <section className="content-section profile-editor" aria-label="Bảo mật tài khoản">
      {!forced && (
        <>
          <h2>Bảo mật tài khoản</h2>
          <p>Đổi mật khẩu</p>
        </>
      )}
      <p className="field-hint">
        Mật khẩu mới cần ít nhất16 ký tự Unicode, tối đa128 đơn vị UTF-16. Khoảng trắng được giữ
        nguyên.
      </p>
      <form onSubmit={submit} noValidate>
        {fields.map((field, index) => (
          <div className="form-field" key={field.id}>
            <label htmlFor={field.id}>{field.label}</label>
            <div className="password-input-row">
              <input
                ref={(node) => {
                  inputs.current[index] = node;
                }}
                id={field.id}
                name={field.id}
                type={visible[index] ? 'text' : 'password'}
                autoComplete={field.autocomplete}
                value={field.value}
                maxLength={128}
                disabled={pending || blocked}
                required
                onChange={(event) => field.set(event.target.value)}
              />
              <button
                type="button"
                className="secondary-button"
                disabled={pending || blocked}
                aria-label={`${visible[index] ? 'Ẩn' : 'Hiện'} ${field.label.toLocaleLowerCase('vi')}`}
                aria-pressed={visible[index]}
                onClick={() =>
                  setVisible((values) =>
                    values.map((value, position) => (position === index ? !value : value)),
                  )
                }
              >
                {visible[index] ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          </div>
        ))}
        <p>Sau khi đổi, các phiên đăng nhập cũ sẽ bị kết thúc.</p>
        {error && (
          <p ref={feedback} role="alert" tabIndex={-1} className="form-error">
            {error}
          </p>
        )}
        {notice && (
          <p ref={feedback} role="status" tabIndex={-1}>
            {notice}
          </p>
        )}
        {blocked ? (
          <Link href="/login">Đăng nhập lại</Link>
        ) : (
          <div className="user-form-actions">
            <button className="primary-button control-form" disabled={pending}>
              {pending ? 'Đang đổi…' : 'Đổi mật khẩu'}
            </button>
            <button
              type="button"
              className="secondary-button control-form"
              disabled={pending || !(current || next || confirmation)}
              onClick={() => {
                clear();
                setError('');
                setNotice('');
              }}
            >
              Xóa các trường
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
