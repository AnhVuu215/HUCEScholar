import { ApiError, apiRequest, csrfToken, roleLabels, type Profile } from './auth';

export const statusLabels = {
  ACTIVE: 'Hoạt động',
  LOCKED: 'Đã khóa',
  PENDING: 'Chờ xác minh',
} as const;
export interface ManagedUser extends Profile {
  status: keyof typeof statusLabels;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
export interface UserList {
  items: ManagedUser[];
  total: number;
  page: number;
  limit: number;
}
export interface UserQuery {
  search: string;
  role: string;
  status: string;
  page: number;
}
export const emptyQuery: UserQuery = { search: '', role: '', status: '', page: 1 };

function isUser(value: unknown): value is ManagedUser {
  if (!value || typeof value !== 'object') return false;
  return (
    'id' in value &&
    typeof value.id === 'string' &&
    /^[1-9]\d*$/.test(value.id) &&
    'email' in value &&
    typeof value.email === 'string' &&
    'displayName' in value &&
    typeof value.displayName === 'string' &&
    'role' in value &&
    typeof value.role === 'string' &&
    Object.hasOwn(roleLabels, value.role) &&
    'status' in value &&
    typeof value.status === 'string' &&
    Object.hasOwn(statusLabels, value.status) &&
    'revision' in value &&
    typeof value.revision === 'number' &&
    Number.isInteger(value.revision) &&
    value.revision > 0 &&
    'verifiedAt' in value &&
    (value.verifiedAt === null || typeof value.verifiedAt === 'string') &&
    'createdAt' in value &&
    typeof value.createdAt === 'string' &&
    'updatedAt' in value &&
    typeof value.updatedAt === 'string' &&
    'mustChangePassword' in value &&
    typeof value.mustChangePassword === 'boolean'
  );
}

export async function listUsers(query: UserQuery, signal: AbortSignal): Promise<UserList> {
  const params = new URLSearchParams({ page: String(query.page), limit: '20' });
  for (const key of ['search', 'role', 'status'] as const)
    if (query[key]) params.set(key, query[key]);
  const body: unknown = await (await apiRequest(`/admin/users?${params}`, { signal })).json();
  if (
    body &&
    typeof body === 'object' &&
    'items' in body &&
    Array.isArray(body.items) &&
    body.items.every(isUser) &&
    'total' in body &&
    typeof body.total === 'number' &&
    Number.isInteger(body.total) &&
    body.total >= 0 &&
    'page' in body &&
    body.page === query.page &&
    'limit' in body &&
    body.limit === 20
  )
    return body as UserList;
  throw new Error('Invalid account list response.');
}

export async function saveUser(path: string, method: 'POST' | 'PATCH', body: object) {
  const token = await csrfToken();
  const response = await apiRequest(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json();
  if (data && typeof data === 'object' && 'user' in data && isUser(data.user)) return data.user;
  throw new Error('Invalid account response.');
}

export async function currentUser(id: string): Promise<ManagedUser> {
  const data: unknown = await (await apiRequest(`/admin/users/${id}`)).json();
  if (data && typeof data === 'object' && 'user' in data && isUser(data.user)) return data.user;
  throw new Error('Invalid account response.');
}

export function userError(error: unknown): { message: string; stale: boolean } {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      window.location.replace('/login');
      return {
        message: 'Phiên đăng nhập đã hết hạn. Đang chuyển đến trang đăng nhập.',
        stale: false,
      };
    }
    if (error.status === 403)
      return {
        message: 'Bạn không còn quyền thực hiện thao tác. Tải lại trang để kiểm tra tài khoản.',
        stale: false,
      };
    if (error.status === 409 && error.code === 'EMAIL_TAKEN')
      return { message: 'Email này đã được sử dụng. Chọn email khác rồi thử lại.', stale: false };
    if (error.status === 409)
      return {
        message:
          'Thông tin đã thay đổi. Nội dung đang nhập được giữ lại. Tải thông tin mới trước khi sửa tiếp.',
        stale: true,
      };
    if (error.status === 400)
      return {
        message:
          'Thông tin chưa hợp lệ. Kiểm tra tên, email, mật khẩu và xác nhận danh sách hợp lệ rồi thử lại.',
        stale: false,
      };
    if (error.status === 404)
      return { message: 'Tài khoản không còn tồn tại. Đóng và tải lại danh sách.', stale: true };
  }
  return {
    message:
      'Chưa lưu được thay đổi. Kiểm tra kết nối rồi thử lại. Nếu yêu cầu trước đã được xử lý, hãy tải lại danh sách để kiểm tra.',
    stale: false,
  };
}
