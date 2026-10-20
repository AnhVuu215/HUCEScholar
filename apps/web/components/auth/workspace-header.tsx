'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { roleLabels, type Profile } from '../../lib/auth';
import { Button } from '../ui/button';

export function WorkspaceHeader({
  user,
  title,
  logoutPending,
  logoutError,
  onLogout,
}: {
  user: Profile;
  title: string;
  logoutPending: boolean;
  logoutError?: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelOpen = open || Boolean(logoutError);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return (
    <header className="workspace-header">
      <p className="workspace-breadcrumb">
        <span>{roleLabels[user.role]}</span>
        <span aria-hidden="true">/</span>
        <span>{title}</span>
      </p>
      <div
        className="workspace-account"
        ref={container}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && panelOpen) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            trigger.current?.focus();
          }
        }}
      >
        <Button
          ref={trigger}
          variant="quiet"
          className="workspace-account-trigger"
          aria-label="Menu tài khoản"
          aria-expanded={panelOpen}
          aria-controls="workspace-account-panel"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="workspace-avatar" aria-hidden="true">
            {Array.from(user.displayName.trim())[0]?.toLocaleUpperCase('vi') || 'H'}
          </span>
          <span className="workspace-account-name" title={user.displayName}>
            {user.displayName}
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m6 9 6 6 6-6"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
        <div id="workspace-account-panel" className="workspace-account-panel" hidden={!panelOpen}>
          <p>{roleLabels[user.role]}</p>
          {logoutError && (
            <p role="alert" className="form-error workspace-account-error">
              {logoutError}
            </p>
          )}
          <Link href="/workspace/profile" onClick={() => setOpen(false)}>
            Tài khoản của tôi
          </Link>
          <Link href="/workspace/settings" onClick={() => setOpen(false)}>
            Cài đặt
          </Link>
          <Button
            variant="quiet"
            disabled={logoutPending}
            pending={logoutPending}
            data-workspace-logout
            onClick={onLogout}
          >
            {logoutPending ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </Button>
        </div>
      </div>
    </header>
  );
}
