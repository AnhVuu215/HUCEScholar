'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { roleLabels } from '../../lib/auth';
import { currentUser, saveUser, userError, type ManagedUser } from '../../lib/users';

export function UserForm({
  user,
  onSaved,
  onClose,
  onReload,
}: {
  user?: ManagedUser;
  onSaved: (user: ManagedUser) => void;
  onClose: () => void;
  onReload: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState({ message: '', stale: false });
  const [latest, setLatest] = useState<ManagedUser | null>(null);
  const [reconciled, setReconciled] = useState(false);
  const latestHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    nameRef.current?.focus();
  }, []);
  useEffect(() => {
    if (failure.message) errorRef.current?.focus();
  }, [failure]);
  useEffect(() => {
    if (latest) latestHeading.current?.focus();
  }, [latest]);

  async function refresh() {
    if (!user || pending) return;
    setPending(true);
    try {
      const current = await currentUser(user.id);
      if (current.role === 'ADMIN') {
        setFailure({
          message: 'Tài khoản hiện là quản trị viên và chỉ được xem. Đóng và tải lại danh sách.',
          stale: true,
        });
        return;
      }
      setLatest(current);
      setReconciled(false);
      setFailure({ message: '', stale: false });
    } catch (error) {
      setFailure({ ...userError(error), stale: true });
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || failure.stale || (latest && !reconciled)) return;
    const form = new FormData(event.currentTarget);
    const values = {
      email: String(form.get('email') ?? '')
        .trim()
        .toLowerCase(),
      displayName: String(form.get('displayName') ?? '').trim(),
    };
    if (!values.displayName) {
      setFailure({ message: 'Họ và tên không được chỉ chứa khoảng trắng.', stale: false });
      return;
    }
    setPending(true);
    setFailure({ message: '', stale: false });
    try {
      const result = await saveUser(
        user ? `/admin/users/${user.id}` : '/admin/users',
        user ? 'PATCH' : 'POST',
        user
          ? {
              ...values,
              revision: latest?.revision ?? user.revision,
            }
          : {
              ...values,
              role: form.get('role'),
              password: form.get('password'),
              eligibilityConfirmed: form.get('eligible') === 'on',
            },
      );
      onSaved(result);
    } catch (error) {
      setFailure(userError(error));
      setReconciled(false);
      setPending(false);
    }
  }

  return (
    <section className="user-editor" aria-labelledby="user-editor-title">
      <h2 id="user-editor-title">{user ? 'Sửa thông tin tài khoản' : 'Cấp tài khoản mới'}</h2>
      <p className="field-hint">
        {user
          ? `Vai trò ${roleLabels[user.role].toLowerCase()} được giữ nguyên. Đổi email sẽ đăng xuất tài khoản trên mọi thiết bị.`
          : 'Chỉ cấp cho người dùng đã được đối chiếu. Tài khoản có thể đăng nhập ngay sau khi tạo.'}
      </p>
      <form onSubmit={(event) => void submit(event)} aria-busy={pending}>
        <fieldset disabled={pending} className="user-fields">
          <legend className="sr-only">Thông tin tài khoản</legend>
          <div className="form-field">
            <label htmlFor="user-name">Họ và tên</label>
            <input
              ref={nameRef}
              id="user-name"
              name="displayName"
              autoComplete="off"
              required
              maxLength={150}
              defaultValue={user?.displayName ?? ''}
            />
          </div>
          <div className="form-field">
            <label htmlFor="user-email">Email đăng nhập</label>
            <input
              id="user-email"
              name="email"
              type="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={254}
              defaultValue={user?.email ?? ''}
            />
          </div>
          {!user && (
            <>
              <div className="form-field">
                <label htmlFor="user-role">Vai trò tài khoản</label>
                <select id="user-role" name="role" defaultValue="STUDENT">
                  <option value="STUDENT">Sinh viên</option>
                  <option value="LECTURER">Giảng viên</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="user-password">Mật khẩu khởi tạo</label>
                <input
                  id="user-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={16}
                  maxLength={128}
                  required
                  aria-describedby="password-guidance"
                />
                <p id="password-guidance" className="field-hint">
                  16–128 ký tự. Chuyển mật khẩu cho người nhận qua kênh riêng. Hệ thống chưa gửi
                  email hoặc hỗ trợ đổi mật khẩu.
                </p>
              </div>
              <label className="eligibility-check">
                <input name="eligible" type="checkbox" required />{' '}
                <span>Tôi đã đối chiếu người dùng với danh sách hợp lệ.</span>
              </label>
            </>
          )}
        </fieldset>
        {failure.message && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="form-error">
            {failure.message}
          </p>
        )}
        {latest && (
          <div className="user-reconciliation">
            <h3 ref={latestHeading} tabIndex={-1}>
              Thông tin hiện tại trên hệ thống
            </h3>
            <dl>
              <div>
                <dt>Họ và tên</dt>
                <dd>{latest.displayName}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{latest.email}</dd>
              </div>
            </dl>
            <p className="field-hint">
              Các ô phía trên giữ nội dung bạn đang nhập. Đối chiếu với bản mới trước khi lưu.
            </p>
            <label className="eligibility-check">
              <input
                type="checkbox"
                checked={reconciled}
                disabled={pending || failure.stale}
                onChange={(event) => setReconciled(event.target.checked)}
              />{' '}
              <span>Tôi đã đối chiếu và muốn lưu nội dung đang nhập.</span>
            </label>
          </div>
        )}
        <div className="user-form-actions">
          <button
            className="primary-button"
            disabled={pending || failure.stale || (!!latest && !reconciled)}
            type="submit"
          >
            {pending ? 'Đang lưu…' : user ? 'Lưu thay đổi' : 'Tạo tài khoản'}
          </button>
          <button className="secondary-button" disabled={pending} type="button" onClick={onClose}>
            Hủy
          </button>
          {failure.stale && (
            <>
              {user && (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={pending}
                  onClick={() => void refresh()}
                >
                  Tải bản mới để đối chiếu
                </button>
              )}
              <button
                className="secondary-button"
                type="button"
                disabled={pending}
                onClick={onReload}
              >
                Đóng và tải lại danh sách
              </button>
            </>
          )}
        </div>
        <p role="status" className="sr-only">
          {pending ? 'Đang lưu tài khoản, vui lòng chờ.' : ''}
        </p>
      </form>
    </section>
  );
}
