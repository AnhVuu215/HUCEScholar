import { ApiError, apiRequest, csrfToken } from './auth';

export const catalogLabels = { faculties: 'Khoa', programs: 'Ngành' } as const;
export type CatalogKind = keyof typeof catalogLabels;
export interface CatalogItem {
  id: string;
  code: string;
  name: string;
  active: boolean;
  revision: number;
  facultyId?: string;
  facultyName?: string;
}
export interface CatalogList {
  items: CatalogItem[];
  total: number;
  page: number;
  limit: number;
}
export function isCatalogItem(value: unknown): value is CatalogItem {
  if (!value || typeof value !== 'object') return false;
  return (
    'id' in value &&
    typeof value.id === 'string' &&
    /^[1-9]\d*$/.test(value.id) &&
    'code' in value &&
    typeof value.code === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'active' in value &&
    typeof value.active === 'boolean' &&
    'revision' in value &&
    Number.isInteger(value.revision) &&
    Number(value.revision) > 0
  );
}
export async function catalogList(
  kind: CatalogKind,
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<CatalogList> {
  const data: unknown = await (
    await apiRequest(`/admin/catalog/${kind}?${params}`, { signal })
  ).json();
  if (
    data &&
    typeof data === 'object' &&
    'items' in data &&
    Array.isArray(data.items) &&
    data.items.every(isCatalogItem) &&
    'total' in data &&
    Number.isInteger(data.total) &&
    Number(data.total) >= 0 &&
    'page' in data &&
    Number.isInteger(data.page) &&
    'limit' in data &&
    Number.isInteger(data.limit)
  )
    return data as CatalogList;
  throw new Error('Invalid catalog response.');
}
export async function academicWrite(path: string, body: object, method = 'POST') {
  const token = await csrfToken();
  return apiRequest(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify(body),
  });
}
export function academicError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      window.location.replace('/login');
      return 'Phiên đăng nhập đã hết hạn.';
    }
    if (error.status === 403)
      return 'Bạn không còn quyền thực hiện thao tác. Tải lại trang để kiểm tra tài khoản.';
    const codes: Record<string, string> = {
      CODE_TAKEN: 'Mã này đã được sử dụng. Chọn mã khác rồi thử lại.',
      STALE_REVISION:
        'Dữ liệu đã thay đổi. Bản sửa của bạn được giữ lại. Bỏ bản sửa và tải lại để dùng thông tin hiện hành.',
      ACTIVE_CHILDREN:
        'Khoa còn ngành hoặc môn hoạt động. Ngừng các danh mục đó trước khi ngừng khoa.',
      INACTIVE_FACULTY:
        'Khoa phụ trách đã ngừng sử dụng. Chọn khoa đang hoạt động hoặc kích hoạt lại khoa trước.',
    };
    if (error.code && codes[error.code]) return codes[error.code];
    if (error.status === 400)
      return 'Thông tin chưa hợp lệ. Kiểm tra mã và các trường bắt buộc rồi thử lại.';
    if (error.status === 404) return 'Không tìm thấy dữ liệu. Tải lại danh sách để kiểm tra.';
  }
  return 'Chưa hoàn tất yêu cầu. Kiểm tra kết nối rồi thử lại; tải lại danh sách nếu chưa rõ yêu cầu trước đã được lưu hay chưa.';
}
