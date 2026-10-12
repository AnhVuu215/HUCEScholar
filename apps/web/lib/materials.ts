import { apiRequest, ApiError, csrfToken } from './auth';
import { academicError, academicWrite } from './academic';

export const materialTypes = {
  TEXTBOOK: 'Giáo trình',
  LECTURE: 'Bài giảng',
  EXERCISE: 'Bài tập',
  EXAM: 'Đề thi',
  REFERENCE: 'Tham khảo',
  OTHER: 'Khác',
} as const;
export const reviewStatuses = {
  DRAFT: 'Bản nháp',
  SUBMITTED: 'Chờ duyệt',
  CHANGES_REQUIRED: 'Yêu cầu sửa',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
} as const;
export interface PublicationHistory {
  items: {
    id: string;
    status: string;
    submittedRevision: number;
    submittedAt: string;
    resolvedAt: string | null;
    reason: string | null;
  }[];
  total: number;
  page: number;
  limit: number;
}
export type CourseChoice = { id: string; code: string; name: string };
export interface MaterialDraft {
  id: string;
  versionId: string;
  versionNo: number;
  pdf: {
    name: string;
    byteSize: number;
    pageCount: number | null;
    hasTextLayer: boolean | null;
  } | null;
  kind: 'LECTURER_MATERIAL' | 'STUDENT_SUPPLEMENT';
  title: string;
  authors: string;
  description: string;
  materialType: keyof typeof materialTypes;
  sourceReference: string;
  rightsBasis: string;
  downloadAllowed: boolean;
  reviewStatus: string;
  fileState: 'MISSING' | 'CHECKING' | 'SAFE' | 'FAILED';
  revision: number;
  updatedAt: string;
  courses: (CourseChoice & { active: boolean })[];
  editable: boolean;
  editBlock: string | null;
}
export interface DraftList {
  items: MaterialDraft[];
  total: number;
  page: number;
  limit: number;
}
export type DraftFields = Pick<
  MaterialDraft,
  | 'title'
  | 'authors'
  | 'description'
  | 'materialType'
  | 'sourceReference'
  | 'rightsBasis'
  | 'downloadAllowed'
> & { courseIds: string[] };
const isId = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9]\d*$/.test(value);
function isCourse(value: unknown): value is CourseChoice {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return isId(c.id) && typeof c.code === 'string' && typeof c.name === 'string';
}
function isDraft(value: unknown): value is MaterialDraft {
  if (!value || typeof value !== 'object') return false;
  const d = value as Record<string, unknown>;
  return (
    isId(d.id) &&
    isId(d.versionId) &&
    Number.isInteger(d.versionNo) &&
    Number(d.versionNo) > 0 &&
    ['LECTURER_MATERIAL', 'STUDENT_SUPPLEMENT'].includes(String(d.kind)) &&
    ['title', 'authors', 'description', 'sourceReference', 'rightsBasis', 'updatedAt'].every(
      (k) => typeof d[k] === 'string',
    ) &&
    typeof d.materialType === 'string' &&
    Object.hasOwn(materialTypes, d.materialType) &&
    ['DRAFT', 'SUBMITTED', 'CHANGES_REQUIRED', 'APPROVED', 'REJECTED'].includes(
      String(d.reviewStatus),
    ) &&
    ['MISSING', 'CHECKING', 'SAFE', 'FAILED'].includes(String(d.fileState)) &&
    (d.pdf === null ||
      (!!d.pdf &&
        typeof d.pdf === 'object' &&
        'name' in d.pdf &&
        typeof d.pdf.name === 'string' &&
        'byteSize' in d.pdf &&
        Number.isSafeInteger(d.pdf.byteSize))) &&
    typeof d.downloadAllowed === 'boolean' &&
    typeof d.editable === 'boolean' &&
    (d.editBlock === null || typeof d.editBlock === 'string') &&
    Number.isInteger(d.revision) &&
    Number(d.revision) > 0 &&
    Array.isArray(d.courses) &&
    d.courses.every((c) => isCourse(c) && 'active' in c && typeof c.active === 'boolean')
  );
}
function isList(
  value: unknown,
): value is { items: unknown[]; total: number; page: number; limit: number } {
  if (!value || typeof value !== 'object') return false;
  const d = value as Record<string, unknown>;
  return (
    Array.isArray(d.items) &&
    Number.isInteger(d.total) &&
    Number(d.total) >= 0 &&
    Number.isInteger(d.page) &&
    Number(d.page) > 0 &&
    Number.isInteger(d.limit) &&
    Number(d.limit) > 0
  );
}
export async function draftList(params: URLSearchParams, signal?: AbortSignal): Promise<DraftList> {
  const data: unknown = await (await apiRequest(`/material-drafts?${params}`, { signal })).json();
  if (isList(data) && data.items.every(isDraft)) return data as DraftList;
  throw new Error('Invalid drafts response.');
}
export async function draftCourses(params: URLSearchParams, signal: AbortSignal) {
  const data: unknown = await (
    await apiRequest(`/material-drafts/courses?${params}`, { signal })
  ).json();
  if (isList(data) && data.items.every(isCourse)) return { items: data.items, total: data.total };
  throw new Error('Invalid course choices.');
}
export async function currentDraft(id: string, signal?: AbortSignal) {
  return readItem(await apiRequest(`/material-drafts/${id}`, { signal }));
}
async function readItem(response: Response) {
  const data: unknown = await response.json();
  if (data && typeof data === 'object' && 'item' in data && isDraft(data.item)) return data.item;
  throw new Error('Invalid draft response.');
}
export async function saveDraft(body: DraftFields, current?: MaterialDraft) {
  return readItem(
    await academicWrite(
      `/material-drafts${current ? `/${current.id}` : ''}`,
      { ...body, ...(current ? { revision: current.revision } : {}) },
      current ? 'PATCH' : 'POST',
    ),
  );
}
export async function publicationHistory(
  id: string,
  page: number,
  signal?: AbortSignal,
): Promise<PublicationHistory> {
  const data: unknown = await (
    await apiRequest(`/material-drafts/${id}/requests?page=${page}&limit=10`, { signal })
  ).json();
  if (
    isList(data) &&
    data.items.every((item) => {
      if (!item || typeof item !== 'object') return false;
      const r = item as Record<string, unknown>;
      return (
        isId(r.id) &&
        ['PENDING', 'WITHDRAWN', 'APPROVED', 'CHANGES_REQUIRED', 'REJECTED'].includes(
          String(r.status),
        ) &&
        Number.isInteger(r.submittedRevision) &&
        typeof r.submittedAt === 'string' &&
        (r.resolvedAt === null || typeof r.resolvedAt === 'string') &&
        (r.reason === null || typeof r.reason === 'string')
      );
    })
  )
    return data as PublicationHistory;
  throw new Error('Invalid publication history.');
}
export async function changePublication(
  current: MaterialDraft,
  action: 'submit' | 'withdraw' | 'reopen',
  reason?: string,
) {
  return readItem(
    await academicWrite(
      `/material-drafts/${current.id}/${action}`,
      { revision: current.revision, ...(action === 'withdraw' ? { reason } : {}) },
      'POST',
    ),
  );
}
export async function uploadDraftPdf(current: MaterialDraft, file: File) {
  return readItem(
    await apiRequest(
      `/material-drafts/${current.id}/pdf`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'X-CSRF-Token': await csrfToken(),
          'X-File-Name': encodeURIComponent(file.name),
          'If-Match': `"${current.revision}"`,
        },
        body: file,
      },
      120_000,
    ),
  );
}
export function materialError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'ASSIGNMENT_REQUIRED')
      return 'Phân công đã thay đổi. Bạn cần phân công hiện hành cho tất cả môn cũ và môn mới để sửa bản nháp. Nội dung đang nhập được giữ lại.';
    if (error.code === 'COURSE_UNAVAILABLE')
      return 'Có môn hoặc khoa đã ngừng sử dụng. Kiểm tra lại các môn đã chọn. Nội dung đang nhập được giữ lại.';
    if (error.code === 'NOT_DRAFT')
      return 'Phiên bản không còn ở trạng thái nháp. Đóng bản sửa và mở lại để kiểm tra.';
    if (error.status === 400 || error.status === 413)
      return 'Thông tin chưa hợp lệ hoặc quá dài. Kiểm tra các trường bắt buộc và môn liên quan.';
  }
  return academicError(error);
}
