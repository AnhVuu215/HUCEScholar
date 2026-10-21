import { ApiError, apiRequest, csrfToken, type Role } from './auth';
import { fileFailedLabel } from './materials';

export const notificationKinds = [
  'FILE_SAFE',
  'FILE_FAILED',
  'SOURCE_READY',
  'SOURCE_FAILED',
  'REVIEW_APPROVED',
  'REVIEW_CHANGES_REQUIRED',
  'REVIEW_REJECTED',
  'REPORT_RESOLVED',
  'REPORT_DISMISSED',
] as const;
export type NotificationKind = (typeof notificationKinds)[number];
export type AppNotification = {
  id: string;
  kind: NotificationKind;
  documentId: string;
  versionId: string;
  title: string;
  detail: string | null;
  createdAt: string;
  read: boolean;
};
export type NotificationList = {
  items: AppNotification[];
  total: number;
  unread: number;
  page: number;
  limit: number;
};

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d*$/.test(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
function valid(v: unknown): v is AppNotification {
  return (
    record(v) &&
    id(v.id) &&
    id(v.documentId) &&
    id(v.versionId) &&
    (notificationKinds as readonly string[]).includes(String(v.kind)) &&
    typeof v.title === 'string' &&
    (v.detail === null || typeof v.detail === 'string') &&
    typeof v.createdAt === 'string' &&
    typeof v.read === 'boolean'
  );
}
function unreadCount(body: unknown) {
  if (record(body) && count(body.unread)) return body.unread;
  throw new Error('Invalid notification count.');
}
async function send(path: string) {
  const token = await csrfToken();
  return apiRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: '{}',
  });
}

export async function notificationList(
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<NotificationList> {
  const body: unknown = await (await apiRequest(`/notifications?${params}`, { signal })).json();
  if (
    record(body) &&
    Array.isArray(body.items) &&
    body.items.every(valid) &&
    count(body.total) &&
    count(body.unread) &&
    Number.isInteger(body.page) &&
    Number.isInteger(body.limit)
  )
    return body as unknown as NotificationList;
  throw new Error('Invalid notification list.');
}
export async function notificationUnread(signal: AbortSignal) {
  return unreadCount(await (await apiRequest('/notifications/unread', { signal })).json());
}
export async function markNotificationRead(notificationId: string) {
  return unreadCount(
    await (await send(`/notifications/${encodeURIComponent(notificationId)}/read`)).json(),
  );
}
export async function markAllNotificationsRead() {
  return unreadCount(await (await send('/notifications/read-all')).json());
}

/** One sentence per kind; the admin's own wording stays on the draft or in the reader. */
export function notificationMessage(n: AppNotification) {
  const title = `“${n.title}”`;
  switch (n.kind) {
    case 'FILE_SAFE':
      return `PDF của ${title} đã qua kiểm tra.`;
    case 'FILE_FAILED':
      return `${fileFailedLabel(n.detail)} — ${title}.`;
    case 'SOURCE_READY':
      return `Bản đọc PDF từ file Word của ${title} đã sẵn sàng.`;
    case 'SOURCE_FAILED':
      return `Chưa tạo được bản đọc PDF từ file Word của ${title}.`;
    case 'REVIEW_APPROVED':
      return `${title} đã được duyệt và công bố.`;
    case 'REVIEW_CHANGES_REQUIRED':
      return `${title} cần chỉnh sửa trước khi duyệt. Xem lý do trong bản nháp.`;
    case 'REVIEW_REJECTED':
      return `${title} không được duyệt. Xem lý do trong bản nháp.`;
    case 'REPORT_RESOLVED':
      return `Báo cáo của bạn về ${title} đã được xử lý.`;
    case 'REPORT_DISMISSED':
      return `Báo cáo của bạn về ${title} đã đóng, tài liệu không cần thay đổi.`;
  }
}
/** Where the notice leads; the target page re-checks access, so a link never grants any. */
export function notificationHref(n: AppNotification, role: Role) {
  if (n.kind.startsWith('REPORT_') || role === 'ADMIN')
    return `/workspace/library/versions/${n.versionId}`;
  return `/workspace/${role.toLowerCase()}/materials?draft=${n.documentId}`;
}
export function notificationError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      window.location.replace('/login');
      return 'Phiên đăng nhập đã hết hạn.';
    }
    if (error.status === 404) return 'Thông báo không còn tồn tại. Tải lại danh sách.';
  }
  return 'Chưa tải được thông báo. Kiểm tra kết nối rồi thử lại.';
}
