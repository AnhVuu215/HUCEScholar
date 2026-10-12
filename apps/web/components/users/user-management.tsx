'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, roleLabels } from '../../lib/auth';
import {
  emptyQuery,
  listUsers,
  statusLabels,
  type ManagedUser,
  type UserList,
  type UserQuery,
} from '../../lib/users';
import { UserForm } from './user-form';
import { StatusConfirm } from './status-confirm';

type ListState =
  { kind: 'loading' } | { kind: 'ready'; data: UserList } | { kind: 'error'; denied: boolean };
type Editor =
  | { kind: 'create' }
  | { kind: 'edit'; user: ManagedUser }
  | { kind: 'status'; user: ManagedUser }
  | null;

export function UserManagement() {
  const [query, setQuery] = useState<UserQuery>(emptyQuery);
  const [draft, setDraft] = useState(emptyQuery);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  const [editor, setEditor] = useState<Editor>(null);
  const [notice, setNotice] = useState('');
  const createButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setState({ kind: 'loading' });
      try {
        const data = await listUsers(query, controller.signal);
        if (!controller.signal.aborted) setState({ kind: 'ready', data });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          window.location.replace('/login');
          return;
        }
        setState({ kind: 'error', denied: error instanceof ApiError && error.status === 403 });
      }
    }
    void load();
    return () => controller.abort();
  }, [query, attempt]);

  function close() {
    setEditor(null);
    requestAnimationFrame(() => createButton.current?.focus());
  }
  function reload() {
    close();
    setAttempt((value) => value + 1);
  }
  function saved(user: ManagedUser) {
    setNotice(
      editor?.kind === 'create'
        ? `Đã cấp tài khoản cho ${user.displayName}. Chuyển thông tin đăng nhập cho người nhận qua kênh riêng.`
        : `Đã cập nhật tài khoản ${user.displayName}.`,
    );
    reload();
  }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery({ ...draft, search: draft.search.trim(), page: 1 });
  }
  function reset() {
    setDraft(emptyQuery);
    setQuery({ ...emptyQuery });
  }
  function open(value: Editor) {
    setNotice('');
    setEditor(value);
  }

  const data = state.kind === 'ready' ? state.data : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  return (
    <div className="users-management">
      <div className="users-toolbar">
        <p className="users-guidance">
          Cấp quyền truy cập cho người dùng đã được đối chiếu. Tài khoản quản trị chỉ được xem tại
          đây.
        </p>
        <button
          ref={createButton}
          type="button"
          className="primary-button"
          disabled={editor !== null || (state.kind === 'error' && state.denied)}
          onClick={() => open({ kind: 'create' })}
        >
          Cấp tài khoản
        </button>
      </div>
      <p className={notice ? 'user-success' : 'sr-only'} role="status">
        {notice}
      </p>
      {editor?.kind === 'create' && (
        <UserForm key="create" onSaved={saved} onClose={close} onReload={reload} />
      )}
      {editor?.kind === 'edit' && (
        <UserForm
          key={editor.user.id}
          user={editor.user}
          onSaved={saved}
          onClose={close}
          onReload={reload}
        />
      )}
      {editor?.kind === 'status' && (
        <StatusConfirm
          key={editor.user.id}
          user={editor.user}
          onSaved={saved}
          onClose={close}
          onReload={reload}
        />
      )}
      <section className="users-directory" aria-labelledby="directory-title">
        <h2 id="directory-title">Danh sách tài khoản</h2>
        <form className="users-filters" onSubmit={apply}>
          <div className="form-field">
            <label htmlFor="user-search">Tìm tài khoản</label>
            <input
              id="user-search"
              type="search"
              placeholder="Họ tên hoặc email"
              maxLength={254}
              value={draft.search}
              onChange={(event) => setDraft({ ...draft, search: event.target.value })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="role-filter">Vai trò</label>
            <select
              id="role-filter"
              value={draft.role}
              onChange={(event) => setDraft({ ...draft, role: event.target.value })}
            >
              <option value="">Tất cả vai trò</option>
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="status-filter">Trạng thái</label>
            <select
              id="status-filter"
              value={draft.status}
              onChange={(event) => setDraft({ ...draft, status: event.target.value })}
            >
              <option value="">Tất cả trạng thái</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button className="secondary-button" type="submit">
            Áp dụng
          </button>
        </form>
        {state.kind === 'loading' && (
          <p className="users-list-message" role="status">
            Đang tải danh sách tài khoản…
          </p>
        )}
        {state.kind === 'error' && (
          <div className="users-list-message">
            <p role="alert">
              {state.denied
                ? 'Bạn không có quyền xem danh sách tài khoản. Tải lại trang để kiểm tra phiên đăng nhập.'
                : 'Chưa tải được danh sách. Kiểm tra kết nối rồi thử lại.'}
            </p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Tải lại danh sách
            </button>
          </div>
        )}
        {data && (
          <>
            <div className="users-result-summary">
              <p>
                Tìm thấy {data.total.toLocaleString('vi-VN')} tài khoản · Trang {data.page}/{pages}
              </p>
              {(query.search || query.role || query.status) && (
                <button className="text-button" type="button" onClick={reset}>
                  Xóa bộ lọc
                </button>
              )}
            </div>
            {data.items.length === 0 ? (
              <div className="users-list-message">
                <p>Không tìm thấy tài khoản phù hợp.</p>
                <p className="field-hint">
                  Thử tên hoặc email khác, hoặc xóa bộ lọc để xem toàn bộ danh sách.
                </p>
              </div>
            ) : (
              <table className="users-table">
                <caption className="sr-only">Tài khoản theo bộ lọc đang áp dụng</caption>
                <thead>
                  <tr>
                    <th scope="col">Người dùng</th>
                    <th scope="col">Vai trò</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((user) => (
                    <tr key={user.id}>
                      <td className="user-identity">
                        <strong>{user.displayName}</strong>
                        <span>{user.email}</span>
                      </td>
                      <td>{roleLabels[user.role]}</td>
                      <td>
                        <span className={`user-status user-status-${user.status.toLowerCase()}`}>
                          {statusLabels[user.status]}
                        </span>
                      </td>
                      <td className="user-row-actions">
                        {user.role === 'ADMIN' ? (
                          <span className="field-hint">Chỉ xem</span>
                        ) : (
                          <>
                            <button
                              className="text-button"
                              type="button"
                              disabled={editor !== null}
                              aria-label={`Sửa ${user.displayName}`}
                              onClick={() => open({ kind: 'edit', user })}
                            >
                              Sửa
                            </button>
                            <button
                              className="text-button"
                              type="button"
                              disabled={editor !== null}
                              aria-label={`${user.status === 'ACTIVE' ? 'Khóa' : user.verifiedAt ? 'Mở khóa' : 'Xác minh'} ${user.displayName}`}
                              onClick={() => open({ kind: 'status', user })}
                            >
                              {user.status === 'ACTIVE'
                                ? 'Khóa'
                                : user.verifiedAt
                                  ? 'Mở khóa'
                                  : 'Xác minh'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <nav className="users-pagination" aria-label="Phân trang tài khoản">
              <button
                className="secondary-button"
                type="button"
                disabled={data.page <= 1}
                onClick={() => setQuery({ ...query, page: query.page - 1 })}
              >
                Trang trước
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={data.page >= pages}
                onClick={() => setQuery({ ...query, page: query.page + 1 })}
              >
                Trang sau
              </button>
            </nav>
          </>
        )}
      </section>
    </div>
  );
}
