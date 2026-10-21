import { apiRequest, ApiError } from './auth';
import { academicError, academicWrite } from './academic';
import { materialTypes, reviewStatuses } from './materials';
export const requestStatuses = {
  PENDING: 'Chờ duyệt',
  WITHDRAWN: 'Đã rút',
  APPROVED: 'Đã duyệt',
  CHANGES_REQUIRED: 'Yêu cầu sửa',
  REJECTED: 'Từ chối',
} as const;
export type Outcome = 'APPROVED' | 'CHANGES_REQUIRED' | 'REJECTED';
export interface ReviewItem {
  id: string;
  revision: number;
  submittedRevision: number;
  status: keyof typeof requestStatuses;
  submittedAt: string;
  resolvedAt: string | null;
  reason: string | null;
  submitter: { id: string; name: string };
  resolvedBy: string | null;
  documentId: string;
  versionId: string;
  versionNo: number;
  versionRevision: number;
  reviewStatus: keyof typeof reviewStatuses;
  kind: 'LECTURER_MATERIAL' | 'STUDENT_SUPPLEMENT';
  visibility: 'VISIBLE' | 'HIDDEN';
  currentVersionId: string | null;
  title: string;
  authors: string;
  description: string;
  materialType: keyof typeof materialTypes;
  sourceReference: string;
  rightsBasis: string;
  rightsValidUntil: string | null;
  downloadAllowed: boolean;
  fileState: 'SAFE' | 'FAILED' | 'CHECKING' | 'MISSING';
  fileError: string | null;
  pdf: { name: string; byteSize: number; pageCount: number | null } | null;
  courses: { id: string; code: string; name: string; active: boolean }[];
  snapshotMatches: boolean;
}
export interface ReviewList {
  items: ReviewItem[];
  total: number;
  page: number;
  limit: number;
}
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d*$/.test(v);
function valid(value: unknown): value is ReviewItem {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    ['id', 'documentId', 'versionId'].every((k) => id(r[k])) &&
    ['revision', 'submittedRevision', 'versionNo', 'versionRevision'].every(
      (k) => Number.isInteger(r[k]) && Number(r[k]) > 0,
    ) &&
    ['title', 'authors', 'description', 'sourceReference', 'rightsBasis', 'submittedAt'].every(
      (k) => typeof r[k] === 'string',
    ) &&
    ['resolvedAt', 'reason', 'resolvedBy', 'rightsValidUntil'].every(
      (k) => r[k] === null || typeof r[k] === 'string',
    ) &&
    Object.hasOwn(requestStatuses, String(r.status)) &&
    Object.hasOwn(reviewStatuses, String(r.reviewStatus)) &&
    Object.hasOwn(materialTypes, String(r.materialType)) &&
    ['LECTURER_MATERIAL', 'STUDENT_SUPPLEMENT'].includes(String(r.kind)) &&
    ['VISIBLE', 'HIDDEN'].includes(String(r.visibility)) &&
    ['SAFE', 'CHECKING', 'FAILED', 'MISSING'].includes(String(r.fileState)) &&
    (r.fileError == null || typeof r.fileError === 'string') &&
    (r.currentVersionId === null || id(r.currentVersionId)) &&
    typeof r.snapshotMatches === 'boolean' &&
    typeof r.downloadAllowed === 'boolean' &&
    !!r.submitter &&
    typeof r.submitter === 'object' &&
    'id' in r.submitter &&
    id(r.submitter.id) &&
    'name' in r.submitter &&
    typeof r.submitter.name === 'string' &&
    (r.pdf === null ||
      (!!r.pdf &&
        typeof r.pdf === 'object' &&
        'name' in r.pdf &&
        typeof r.pdf.name === 'string' &&
        'byteSize' in r.pdf &&
        Number.isSafeInteger(r.pdf.byteSize))) &&
    Array.isArray(r.courses) &&
    r.courses.every(
      (c) =>
        c &&
        typeof c === 'object' &&
        id(c.id) &&
        typeof c.name === 'string' &&
        typeof c.code === 'string' &&
        typeof c.active === 'boolean',
    )
  );
}
export async function reviewList(
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<ReviewList> {
  const body: unknown = await (
    await apiRequest(`/admin/publication-requests?${params}`, { signal })
  ).json();
  if (
    body &&
    typeof body === 'object' &&
    'items' in body &&
    Array.isArray(body.items) &&
    body.items.every(valid) &&
    'total' in body &&
    Number.isInteger(body.total) &&
    Number(body.total) >= 0 &&
    'page' in body &&
    Number.isInteger(body.page) &&
    'limit' in body &&
    Number.isInteger(body.limit)
  )
    return body as ReviewList;
  throw new Error('Invalid review list.');
}
async function item(response: Response) {
  const body: unknown = await response.json();
  if (body && typeof body === 'object' && 'item' in body && valid(body.item)) return body.item;
  throw new Error('Invalid review item.');
}
export async function currentReview(id: string, signal?: AbortSignal) {
  return item(await apiRequest(`/admin/publication-requests/${id}`, { signal }));
}
export async function decideReview(
  row: ReviewItem,
  outcome: Outcome,
  reason: string,
  rightsConfirmed: boolean,
) {
  return item(
    await academicWrite(`/admin/publication-requests/${row.id}/decision`, {
      revision: row.revision,
      submittedRevision: row.submittedRevision,
      outcome,
      reason,
      rightsConfirmed,
    }),
  );
}
export function reviewError(error: unknown) {
  const codes: Record<string, string> = {
    REQUEST_CHANGED: 'Lần gửi đã thay đổi hoặc đã kết thúc. Tải trạng thái yêu cầu để đối chiếu.',
    FILE_NOT_SAFE: 'PDF không còn an toàn. Chưa thể duyệt; tải trạng thái yêu cầu để kiểm tra.',
    RIGHTS_EXPIRED: 'Căn cứ quyền đã hết hạn. Yêu cầu người phụ trách bổ sung trước khi duyệt.',
    MANAGER_UNAVAILABLE: 'Chủ tài liệu không còn đủ điều kiện công bố.',
    ASSIGNMENT_REQUIRED: 'Giảng viên không còn đủ phân công cho tất cả môn liên quan.',
    COURSE_UNAVAILABLE: 'Môn hoặc khoa đã ngừng hoạt động.',
    RIGHTS_CONFIRMATION_REQUIRED: 'Xác nhận đã kiểm tra nội dung và căn cứ quyền trước khi duyệt.',
    METADATA_REQUIRED: 'Học liệu chưa đủ thông tin, nguồn, căn cứ quyền hoặc môn.',
  };
  return error instanceof ApiError && error.code && codes[error.code]
    ? codes[error.code]
    : academicError(error);
}
