import { isRecord, isNumericId } from './guards';
import { ApiError, apiRequest, csrfToken } from './auth';

export const reportCategories = {
  FILE_ERROR: 'File lỗi, thiếu trang hoặc chữ mờ',
  WRONG_COURSE: 'Sai môn học',
  RIGHTS: 'Nghi vấn quyền sử dụng',
  CONTENT: 'Thông tin hoặc nội dung sai',
  BROKEN_LINK: 'Không mở hoặc tải được',
  OTHER: 'Khác',
} as const;
export const reportStatuses = {
  OPEN: 'Đang chờ xử lý',
  IN_REVIEW: 'Đang xem xét',
  RESOLVED: 'Đã xử lý',
  DISMISSED: 'Không cần xử lý',
} as const;
export type ReportCategory = keyof typeof reportCategories;
export type ReportStatus = keyof typeof reportStatuses;

export interface MyReport {
  id: string;
  versionId: string;
  category: ReportCategory;
  description: string;
  status: ReportStatus;
  createdAt: string;
  result: string | null;
  resultAt: string | null;
}
export interface AdminReport {
  id: string;
  documentId: string;
  versionId: string;
  title: string;
  versionNo: number;
  category: ReportCategory;
  description: string;
  status: ReportStatus;
  reporter: { displayName: string; email: string };
  createdAt: string;
  updatedAt: string;
  revision: number;
}
export interface AdminReportDetail extends AdminReport {
  document: { visibility: 'VISIBLE' | 'HIDDEN'; revision: number };
  actions: {
    id: string;
    action: 'TAKE_REVIEW' | 'RESOLVE' | 'DISMISS';
    result: string;
    performedBy: string;
    hiddenReason: string | null;
    createdAt: string;
  }[];
}
export interface AdminReportList {
  items: AdminReport[];
  total: number;
  page: number;
  limit: number;
}

const known = (v: unknown, values: object) => typeof v === 'string' && Object.hasOwn(values, v);
function isMine(v: unknown): v is MyReport {
  return (
    isRecord(v) &&
    isNumericId(v.id) &&
    isNumericId(v.versionId) &&
    known(v.category, reportCategories) &&
    known(v.status, reportStatuses) &&
    typeof v.description === 'string' &&
    typeof v.createdAt === 'string' &&
    (v.result === null || typeof v.result === 'string')
  );
}
function isAdmin(v: unknown): v is AdminReport {
  return (
    isRecord(v) &&
    isNumericId(v.id) &&
    isNumericId(v.documentId) &&
    isNumericId(v.versionId) &&
    typeof v.title === 'string' &&
    Number.isInteger(v.versionNo) &&
    known(v.category, reportCategories) &&
    known(v.status, reportStatuses) &&
    typeof v.description === 'string' &&
    isRecord(v.reporter) &&
    typeof v.reporter.displayName === 'string' &&
    typeof v.reporter.email === 'string' &&
    Number.isInteger(v.revision)
  );
}
function isDetail(v: unknown): v is AdminReportDetail {
  return (
    isAdmin(v) &&
    isRecord((v as unknown as Record<string, unknown>).document) &&
    Array.isArray((v as unknown as Record<string, unknown>).actions)
  );
}
async function send(path: string, body: object) {
  const token = await csrfToken();
  return apiRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify(body),
  });
}
const versionPath = (versionId: string) =>
  `/library/versions/${encodeURIComponent(versionId)}/reports`;

export async function createReport(
  versionId: string,
  category: ReportCategory,
  description: string,
) {
  const body: unknown = await (
    await send(versionPath(versionId), { category, description })
  ).json();
  if (isRecord(body) && isMine(body.item)) return body.item;
  throw new Error('Invalid report response.');
}
export async function myReports(versionId: string, signal: AbortSignal): Promise<MyReport[]> {
  const body: unknown = await (
    await apiRequest(`${versionPath(versionId)}/mine`, { signal })
  ).json();
  if (isRecord(body) && Array.isArray(body.items) && body.items.every(isMine)) return body.items;
  throw new Error('Invalid reports response.');
}
export async function adminReports(
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<AdminReportList> {
  const body: unknown = await (await apiRequest(`/admin/reports?${params}`, { signal })).json();
  if (
    isRecord(body) &&
    Array.isArray(body.items) &&
    body.items.every(isAdmin) &&
    Number.isInteger(body.total)
  )
    return body as unknown as AdminReportList;
  throw new Error('Invalid report list.');
}
export async function adminReport(reportId: string, signal?: AbortSignal) {
  const body: unknown = await (
    await apiRequest(`/admin/reports/${encodeURIComponent(reportId)}`, { signal })
  ).json();
  if (isRecord(body) && isDetail(body.item)) return body.item;
  throw new Error('Invalid report.');
}
export async function actOnReport(
  reportId: string,
  data: {
    action: 'TAKE_REVIEW' | 'RESOLVE' | 'DISMISS';
    revision: number;
    result?: string;
    hide?: boolean;
    documentRevision?: number;
    hideReason?: string;
  },
) {
  const body: unknown = await (
    await send(`/admin/reports/${encodeURIComponent(reportId)}/actions`, data)
  ).json();
  if (isRecord(body) && isDetail(body.item)) return body.item;
  throw new Error('Invalid report.');
}
export function reportError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'DUPLICATE_REPORT')
      return 'Bạn đã có báo cáo cùng loại đang chờ xử lý cho phiên bản này.';
    if (error.code === 'STALE_REVISION')
      return 'Báo cáo hoặc tài liệu đã thay đổi. Tải lại để đối chiếu trước khi xử lý.';
    if (error.code === 'REPORT_CLOSED') return 'Báo cáo đã được xử lý. Tải lại để xem kết quả.';
    if (error.code === 'VISIBILITY_UNCHANGED') return 'Tài liệu đã bị ẩn. Tải lại để đối chiếu.';
    if (error.status === 400) return 'Thông tin chưa hợp lệ. Kiểm tra loại báo cáo và nội dung.';
    if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.';
    if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if (error.status === 404) return 'Học liệu hoặc báo cáo không còn khả dụng.';
  }
  return 'Chưa gửi được. Kiểm tra kết nối rồi thử lại; nội dung đang nhập được giữ.';
}
