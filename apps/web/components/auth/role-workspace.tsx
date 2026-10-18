'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { WorkspaceNavigation } from './workspace-navigation';
import { WorkspaceHeader } from './workspace-header';
import { WorkspaceProfileContext } from './workspace-profile-context';
import { ProfileEditor } from '../account/profile-editor';
import type { WorkspaceSection } from '../../lib/workspace-navigation';
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
  activeSection?: WorkspaceSection;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const updateProfile = useCallback((user: Profile) => {
    setState((current) =>
      current.kind === 'ready' && current.user.id === user.id ? { ...current, user } : current,
    );
  }, []);
  // Auth resolves after hydration; earlier role links could navigate as plain anchors
  // and lose in-memory drafts when Back/Forward loads a new document.
  const navigationRole =
    state.kind === 'ready' || state.kind === 'denied' ? state.user.role : undefined;

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
      <aside
        className="workspace-sidebar"
        data-menu-open={menuOpen}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && menuOpen) {
            setMenuOpen(false);
            menuButton.current?.focus();
          }
        }}
      >
        <div className="workspace-sidebar-heading">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              H
            </span>
            <span>HUCEScholar</span>
          </Link>
          <button
            ref={menuButton}
            type="button"
            className="workspace-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="workspace-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d={menuOpen ? 'M6 6l12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'}
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            Menu
          </button>
        </div>
        <p className="sidebar-description">
          Không gian học liệu
          <br />
          dành cho cộng đồng HUCE
        </p>
        <WorkspaceNavigation
          role={navigationRole}
          activeSection={activeSection}
          onNavigate={() => setMenuOpen(false)}
        />
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
          <WorkspaceProfileContext.Provider
            key={state.user.id}
            value={{
              user: state.user,
              update: updateProfile,
            }}
          >
            <WorkspaceHeader
              user={state.user}
              title={title ?? 'Tài khoản của tôi'}
              logoutPending={logoutPending}
              logoutError={logoutError}
              onLogout={() => void logout()}
            />
            <div className="account-heading">
              <div>
                <h1>{title ?? `Không gian ${roleLabels[state.user.role].toLowerCase()}`}</h1>
                <p className="intro">{description ?? `Chào ${state.user.displayName}.`}</p>
              </div>
            </div>
            {children ?? <ProfileEditor />}
            <footer className="page-footer workspace-footer">
              <span>HUCEScholar · Đang phát triển</span>
              <Link href="/project">Tiến độ dự án</Link>
            </footer>
          </WorkspaceProfileContext.Provider>
        )}
      </main>
    </div>
  );
}
