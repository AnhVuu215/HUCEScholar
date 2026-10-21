'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useWorkspaceProfile } from '../auth/workspace-profile-context';
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationError,
  notificationHref,
  notificationList,
  notificationMessage,
  type NotificationList as List,
} from '../../lib/notifications';
import { notificationsChanged } from './notification-bell';

function announce(unread: number) {
  window.dispatchEvent(new CustomEvent(notificationsChanged, { detail: unread }));
}

export function NotificationList() {
  const { user } = useWorkspaceProfile();
  const [query, setQuery] = useState({ page: 1, unreadOnly: false });
  const [data, setData] = useState<List | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void notificationList(
      new URLSearchParams({
        page: String(query.page),
        limit: '20',
        ...(query.unreadOnly ? { filter: 'unread' } : {}),
      }),
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        announce(result.unread);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(notificationError(failure));
      });
    return () => controller.abort();
  }, [query, attempt]);
  function reload() {
    setError('');
    setData(null);
    setAttempt((v) => v + 1);
  }
  async function markRead(id: string) {
    setBusy(true);
    setNotice('');
    try {
      const unread = await markNotificationRead(id);
      announce(unread);
      setData((v) =>
        v
          ? { ...v, unread, items: v.items.map((n) => (n.id === id ? { ...n, read: true } : n)) }
          : v,
      );
    } catch (failure) {
      setNotice(notificationError(failure));
    } finally {
      setBusy(false);
    }
  }
  async function markAll() {
    setBusy(true);
    setNotice('');
    try {
      announce(await markAllNotificationsRead());
      setNotice('Đã đánh dấu tất cả là đã đọc.');
      reload();
      heading.current?.focus();
    } catch (failure) {
      setNotice(notificationError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="users-directory notification-list" aria-labelledby="notification-title">
      <div className="notification-toolbar">
        <h2 id="notification-title" ref={heading} tabIndex={-1}>
          {query.unreadOnly ? 'Thông báo chưa đọc' : 'Tất cả thông báo'}
        </h2>
        <div className="notification-actions">
          <button
            className="secondary-button"
            aria-pressed={query.unreadOnly}
            onClick={() => {
              setData(null);
              setError('');
              setQuery((v) => ({ page: 1, unreadOnly: !v.unreadOnly }));
            }}
          >
            {query.unreadOnly ? 'Xem tất cả' : 'Chỉ chưa đọc'}
          </button>
          <button
            className="secondary-button"
            disabled={busy || !data?.unread}
            onClick={() => void markAll()}
          >
            Đánh dấu tất cả đã đọc
          </button>
        </div>
      </div>
      <p className="field-hint">
        Thông báo về file bạn tải lên, kết quả duyệt và báo cáo bạn đã gửi. Chỉ bạn xem được.
      </p>
      {notice && <p role="status">{notice}</p>}
      {error ? (
        <div className="users-list-message">
          <p role="alert" className="form-error">
            {error}
          </p>
          <button className="secondary-button" onClick={reload}>
            Thử tải lại
          </button>
        </div>
      ) : !data ? (
        <p className="users-list-message" role="status">
          Đang tải thông báo…
        </p>
      ) : data.items.length === 0 ? (
        <p className="users-list-message">
          {query.unreadOnly ? 'Không có thông báo chưa đọc.' : 'Chưa có thông báo nào.'}
        </p>
      ) : (
        <>
          <ul className="notification-items">
            {data.items.map((n) => (
              <li key={n.id} data-read={n.read}>
                <p>
                  {!n.read && <span className="sr-only">Chưa đọc. </span>}
                  {notificationMessage(n)}
                </p>
                <p className="field-hint">
                  {new Date(n.createdAt).toLocaleString('vi-VN')}
                  {n.read ? ' · Đã đọc' : ''}
                </p>
                <div className="notification-item-actions">
                  <Link
                    href={notificationHref(n, user.role)}
                    onClick={() => {
                      if (!n.read) void markNotificationRead(n.id).then(announce, () => undefined);
                    }}
                  >
                    {n.kind.startsWith('REPORT_') ? 'Mở tài liệu' : 'Mở bản nháp'}
                  </Link>
                  {!n.read && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void markRead(n.id)}
                    >
                      Đánh dấu đã đọc
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="users-pagination">
            <button
              className="secondary-button"
              disabled={data.page <= 1}
              onClick={() => {
                setData(null);
                setQuery((v) => ({ ...v, page: v.page - 1 }));
              }}
            >
              Trang trước
            </button>
            <button
              className="secondary-button"
              disabled={data.page * data.limit >= data.total}
              onClick={() => {
                setData(null);
                setQuery((v) => ({ ...v, page: v.page + 1 }));
              }}
            >
              Trang sau
            </button>
          </div>
        </>
      )}
    </section>
  );
}
