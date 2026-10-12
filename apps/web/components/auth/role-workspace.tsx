'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ApiError,
  apiRequest,
  csrfToken,
  readProfile,
  roleLabels,
  workspacePath,
  type Profile,
  type Role,
} from '../../lib/auth';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; user: Profile }
  | { kind: 'denied'; user: Profile }
  | { kind: 'error' };
const upcoming: Record<Role, string> = {
  ADMIN:
    'Bạn có thể quản lý tài khoản, danh mục, phân công và kiểm duyệt học liệu. Mở Kiểm duyệt học liệu để xem yêu cầu, yêu cầu sửa, từ chối hoặc duyệt bản hiện hành.',
  LECTURER:
    'Bạn có thể xem phân công, chuẩn bị bản nháp, tải PDF, gửi/rút yêu cầu và xem quyết định. Mở Kho học liệu để tìm và đọc bản đã công bố. Phiên bản kế tiếp và ghi chú riêng sẽ được bổ sung sau.',
  STUDENT:
    'Bạn có thể tìm và đọc trong Kho học liệu, tải khi được phép, chuẩn bị tài liệu bổ sung và theo dõi kết quả duyệt. Ghi chú riêng và lưu tiến độ sẽ được bổ sung sau.',
};

export function RoleWorkspace({
  role,
  children,
  title,
  description,
  activeSection,
}: {
  role: Role;
  children?: ReactNode;
  title?: string;
  description?: string;
  activeSection?: 'users' | 'catalog' | 'assignments' | 'materials' | 'moderation' | 'library';
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setState({ kind: 'loading' });
      try {
        const response = await apiRequest(`/workspace/${role.toLowerCase()}`, {
          signal: controller.signal,
        });
        const user = await readProfile(response);
        if (!controller.signal.aborted) setState({ kind: 'ready', user });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          window.location.replace('/login');
          return;
        }
        if (error instanceof ApiError && error.status === 403) {
          try {
            const user = await readProfile(
              await apiRequest('/auth/me', { signal: controller.signal }),
            );
            if (!controller.signal.aborted) setState({ kind: 'denied', user });
            return;
          } catch (failure) {
            if (failure instanceof ApiError && failure.status === 401) {
              window.location.replace('/login');
              return;
            }
          }
        }
        if (!controller.signal.aborted) setState({ kind: 'error' });
      }
    }
    void load();
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) void load();
    };
    const hide = () => setState({ kind: 'loading' });
    window.addEventListener('pageshow', restore);
    window.addEventListener('pagehide', hide);
    return () => {
      controller.abort();
      window.removeEventListener('pageshow', restore);
      window.removeEventListener('pagehide', hide);
    };
  }, [role, attempt]);

  async function logout() {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError('');
    try {
      const token = await csrfToken();
      await apiRequest('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': token } });
      setState({ kind: 'loading' });
      window.location.replace('/login');
    } catch {
      setLogoutError('Chưa đăng xuất được. Kiểm tra kết nối rồi thử lại.');
      setLogoutPending(false);
    }
  }

  return (
    <div className="app-shell min-h-screen">
      <a href="#khong-gian" className="skip-link">
        Bỏ qua điều hướng
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <span>HUCEScholar</span>
        </Link>
        <p className="sidebar-description">
          Không gian học liệu
          <br />
          dành cho cộng đồng HUCE
        </p>
        <nav aria-label="Điều hướng không gian">
          {state.kind === 'ready' && (
            <Link
              href={workspacePath(state.user.role)}
              aria-current={activeSection ? undefined : 'page'}
            >
              Tài khoản của tôi
            </Link>
          )}
          {state.kind === 'ready' && state.user.role === 'ADMIN' && (
            <Link
              href="/workspace/admin/users"
              aria-current={activeSection === 'users' ? 'page' : undefined}
            >
              Quản lý tài khoản
            </Link>
          )}
          {state.kind === 'ready' && state.user.role === 'ADMIN' && (
            <Link
              href="/workspace/admin/catalog/faculties"
              aria-current={activeSection === 'catalog' ? 'page' : undefined}
            >
              Danh mục đào tạo
            </Link>
          )}
          {state.kind === 'ready' && state.user.role !== 'STUDENT' && (
            <Link
              href={`/workspace/${state.user.role.toLowerCase()}/assignments`}
              aria-current={activeSection === 'assignments' ? 'page' : undefined}
            >
              {state.user.role === 'ADMIN' ? 'Phân công giảng viên' : 'Phân công của tôi'}
            </Link>
          )}
          {state.kind === 'ready' && state.user.role !== 'ADMIN' && (
            <Link
              href={`/workspace/${state.user.role.toLowerCase()}/materials`}
              aria-current={activeSection === 'materials' ? 'page' : undefined}
            >
              Học liệu của tôi
            </Link>
          )}
          {state.kind === 'ready' && state.user.role === 'ADMIN' && (
            <Link
              href="/workspace/admin/moderation"
              aria-current={activeSection === 'moderation' ? 'page' : undefined}
            >
              Kiểm duyệt học liệu
            </Link>
          )}
          <Link href="/project">Tiến độ dự án</Link>
          {state.kind === 'ready' && (
            <Link
              href="/workspace/library"
              aria-current={activeSection === 'library' ? 'page' : undefined}
            >
              Kho học liệu
            </Link>
          )}
        </nav>
        <p className="sidebar-note">
          Dự án độc lập đang phát triển. Chưa phải hệ thống chính thức của trường.
        </p>
      </aside>
      <main id="khong-gian" tabIndex={-1} className="workspace account-workspace">
        {state.kind === 'loading' && (
          <>
            <h1>Đang mở không gian của bạn</h1>
            <p role="status" className="intro">
              Đang kiểm tra phiên đăng nhập…
            </p>
          </>
        )}
        {state.kind === 'error' && (
          <>
            <h1>Chưa mở được không gian</h1>
            <p role="alert" className="intro">
              Không kết nối được hệ thống. Kiểm tra kết nối rồi thử lại.
            </p>
            <button className="primary-button" onClick={() => setAttempt((value) => value + 1)}>
              Thử lại
            </button>
          </>
        )}
        {state.kind === 'denied' && (
          <>
            <h1>Không có quyền truy cập</h1>
            <p className="intro">
              Khu vực này dành cho {roleLabels[role].toLowerCase()}. Tài khoản của bạn có vai trò{' '}
              {roleLabels[state.user.role].toLowerCase()}.
            </p>
            <Link className="project-link" href={workspacePath(state.user.role)}>
              Về không gian của tôi
            </Link>
          </>
        )}
        {state.kind === 'ready' && (
          <>
            <header className="account-heading">
              <div>
                <h1>{title ?? `Không gian ${roleLabels[state.user.role].toLowerCase()}`}</h1>
                <p className="intro">{description ?? `Chào ${state.user.displayName}.`}</p>
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={logoutPending}
                data-workspace-logout
                onClick={() => void logout()}
              >
                {logoutPending ? 'Đang đăng xuất…' : 'Đăng xuất'}
              </button>
            </header>
            {logoutError && (
              <p role="alert" className="form-error">
                {logoutError}
              </p>
            )}
            {children ?? (
              <>
                <section className="account-details" aria-labelledby="account-title">
                  <h2 id="account-title">Tài khoản của bạn</h2>
                  <dl className="scope-list">
                    <div>
                      <dt>Họ tên</dt>
                      <dd>{state.user.displayName}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{state.user.email}</dd>
                    </div>
                    <div>
                      <dt>Vai trò</dt>
                      <dd>{roleLabels[state.user.role]}</dd>
                    </div>
                  </dl>
                </section>
                <section className="content-section" aria-labelledby="upcoming-title">
                  <h2 id="upcoming-title">Không gian đang được hoàn thiện</h2>
                  <p>{upcoming[state.user.role]}</p>
                  <p>
                    {state.user.role === 'ADMIN'
                      ? 'Bạn có thể cấp và quản lý tài khoản giảng viên, sinh viên. Chưa có học liệu thật trong hệ thống.'
                      : 'Mở Kho học liệu để tìm và đọc; mở Học liệu của tôi để chuẩn bị bản nháp và theo dõi kết quả duyệt.'}
                  </p>
                </section>
              </>
            )}
            <footer className="page-footer">HUCEScholar · Đang phát triển</footer>
          </>
        )}
      </main>
    </div>
  );
}
