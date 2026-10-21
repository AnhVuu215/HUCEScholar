'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { apiRequest, readProfile, ApiError, type Role } from '../../lib/auth';
import { RoleWorkspace } from '../auth/role-workspace';
export function LibraryWorkspace({
  children,
  title,
  description,
  personal = false,
  account = false,
  readingLists = false,
}: {
  children: ReactNode;
  title: string;
  description: string;
  personal?: boolean;
  account?: boolean;
  readingLists?: boolean;
}) {
  const [role, setRole] = useState<Role | null>(null),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest('/auth/me', { signal: controller.signal })
      .then(readProfile)
      .then((user) => {
        if (!controller.signal.aborted) setRole(user.role);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) window.location.replace('/login');
        else setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  if (!role)
    return (
      <main className="workspace">
        <h1>{title}</h1>
        {error ? (
          <>
            <p role="alert">Chưa kiểm tra được phiên đăng nhập.</p>
            <button
              className="primary-button"
              onClick={() => {
                setError(false);
                setAttempt((n) => n + 1);
              }}
            >
              Thử lại
            </button>
          </>
        ) : (
          <p role="status">Đang kiểm tra phiên đăng nhập…</p>
        )}
      </main>
    );
  return (
    <RoleWorkspace
      role={role}
      title={title}
      description={description}
      activeSection={
        account ? undefined : readingLists ? 'readingLists' : personal ? 'personal' : 'library'
      }
    >
      {children}
    </RoleWorkspace>
  );
}
