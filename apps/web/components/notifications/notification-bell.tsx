'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { notificationUnread } from '../../lib/notifications';

/** Pages that change the count (the notifications list) announce it with this event. */
export const notificationsChanged = 'hucescholar:notifications';
const refreshMs = 60_000;

/**
 * A link with the unread count. Polls only while the tab is visible; a failed check keeps the
 * last known count instead of claiming there is nothing new.
 */
export function NotificationBell() {
  const [unread, setUnread] = useState<number | null>(null);
  useEffect(() => {
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      controller?.abort();
      if (document.visibilityState !== 'visible') return;
      const current = new AbortController();
      controller = current;
      void notificationUnread(current.signal)
        .then((value) => {
          if (!current.signal.aborted) setUnread(value);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!current.signal.aborted) timer = setTimeout(check, refreshMs);
        });
    };
    const changed = (event: Event) => {
      const value = (event as CustomEvent<number>).detail;
      if (Number.isSafeInteger(value)) setUnread(value);
    };
    check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener(notificationsChanged, changed);
    return () => {
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener(notificationsChanged, changed);
    };
  }, []);
  const label = unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo';
  return (
    <Link className="workspace-notifications" href="/workspace/notifications" aria-label={label}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4h4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!!unread && (
        <span className="workspace-notifications-count" aria-hidden="true">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
