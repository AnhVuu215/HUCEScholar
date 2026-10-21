import { ApiError, apiRequest } from './auth';
import { academicError, academicWrite } from './academic';
type Version = {
  id: string;
  versionNo: number;
  title: string;
  reviewStatus: string;
  publicationMethod: 'ADMIN_REVIEW' | 'LECTURER_SELF';
  fileState: string;
  fileError?: string | null;
};
export type ManagedMaterial = {
  id: string;
  kind: 'LECTURER_MATERIAL' | 'STUDENT_SUPPLEMENT';
  visibility: 'VISIBLE' | 'HIDDEN';
  revision: number;
  manager: { id: string; name: string };
  latest: Version;
  currentVersionId: string | null;
};
export type MaterialLifecycle = ManagedMaterial & {
  current: Version | null;
  courses: { id: string; code: string; name: string }[];
  history: {
    transfers: {
      id: string;
      fromUserId: string;
      toUserId: string;
      fromName: string;
      toName: string;
      performedBy: string;
      reason: string;
      createdAt: string;
    }[];
    visibility: {
      id: string;
      fromVisibility: string;
      toVisibility: string;
      performedBy: string;
      reason: string;
      createdAt: string;
    }[];
    totalTransfers: number;
    totalVisibility: number;
    page: number;
    limit: number;
  };
};
type List = { items: ManagedMaterial[]; total: number; page: number; limit: number };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d*$/.test(v);
const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
const version = (v: unknown): v is Version =>
  record(v) &&
  id(v.id) &&
  integer(v.versionNo) &&
  Number(v.versionNo) > 0 &&
  typeof v.title === 'string' &&
  ['ADMIN_REVIEW', 'LECTURER_SELF'].includes(String(v.publicationMethod)) &&
  ['DRAFT', 'SUBMITTED', 'CHANGES_REQUIRED', 'APPROVED', 'REJECTED'].includes(
    String(v.reviewStatus),
  ) &&
  ['MISSING', 'CHECKING', 'SAFE', 'FAILED'].includes(String(v.fileState)) &&
  (v.fileError == null || typeof v.fileError === 'string');
function overview(v: unknown): v is ManagedMaterial {
  return (
    record(v) &&
    id(v.id) &&
    ['LECTURER_MATERIAL', 'STUDENT_SUPPLEMENT'].includes(String(v.kind)) &&
    ['VISIBLE', 'HIDDEN'].includes(String(v.visibility)) &&
    integer(v.revision) &&
    Number(v.revision) > 0 &&
    record(v.manager) &&
    id(v.manager.id) &&
    typeof v.manager.name === 'string' &&
    version(v.latest) &&
    (v.currentVersionId === null || id(v.currentVersionId))
  );
}
function detail(v: unknown): v is MaterialLifecycle {
  if (!overview(v)) return false;
  const d = v as unknown as Record<string, unknown>,
    h = d.history;
  return (
    (d.current === null || version(d.current)) &&
    Array.isArray(d.courses) &&
    d.courses.every(
      (c) => record(c) && id(c.id) && typeof c.code === 'string' && typeof c.name === 'string',
    ) &&
    record(h) &&
    ['totalTransfers', 'totalVisibility', 'page', 'limit'].every((k) => integer(h[k])) &&
    Array.isArray(h.transfers) &&
    h.transfers.every(
      (t) =>
        record(t) &&
        id(t.id) &&
        id(t.fromUserId) &&
        id(t.toUserId) &&
        typeof t.fromName === 'string' &&
        typeof t.toName === 'string' &&
        id(t.performedBy) &&
        typeof t.reason === 'string' &&
        typeof t.createdAt === 'string',
    ) &&
    Array.isArray(h.visibility) &&
    h.visibility.every(
      (t) =>
        record(t) &&
        id(t.id) &&
        id(t.performedBy) &&
        ['VISIBLE', 'HIDDEN'].includes(String(t.fromVisibility)) &&
        ['VISIBLE', 'HIDDEN'].includes(String(t.toVisibility)) &&
        typeof t.reason === 'string' &&
        typeof t.createdAt === 'string',
    )
  );
}
async function readItem(response: Response) {
  const data: unknown = await response.json();
  if (record(data) && detail(data.item)) return data.item;
  throw new Error('Invalid lifecycle response.');
}
export async function managedMaterials(
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<List> {
  for (const key of ['kind', 'visibility']) if (!params.get(key)) params.delete(key);
  const data: unknown = await (await apiRequest(`/admin/materials?${params}`, { signal })).json();
  if (
    record(data) &&
    Array.isArray(data.items) &&
    data.items.every(overview) &&
    ['total', 'page', 'limit'].every((k) => integer(data[k]))
  )
    return data as List;
  throw new Error('Invalid managed materials.');
}
export async function materialLifecycle(id: string, page = 1, signal?: AbortSignal) {
  return readItem(await apiRequest(`/admin/materials/${id}?page=${page}&limit=10`, { signal }));
}
export async function transferRecipients(id: string, params: URLSearchParams, signal: AbortSignal) {
  const data: unknown = await (
    await apiRequest(`/admin/materials/${id}/recipients?${params}`, { signal })
  ).json();
  if (
    record(data) &&
    Array.isArray(data.items) &&
    data.items.every(
      (v) =>
        record(v) &&
        typeof v.name === 'string' &&
        typeof v.id === 'string' &&
        /^[1-9]\d*$/.test(v.id),
    ) &&
    integer(data.total)
  )
    return {
      items: data.items.map((v) => ({
        id: String(v.id),
        code: String(v.id),
        name: String(v.name),
      })),
      total: Number(data.total),
    };
  throw new Error('Invalid transfer recipients.');
}
export async function changeMaterial(
  current: MaterialLifecycle,
  action: 'transfer' | 'visibility',
  body: object,
) {
  return readItem(
    await academicWrite(`/admin/materials/${current.id}/${action}`, {
      ...body,
      revision: current.revision,
    }),
  );
}
export function lifecycleError(e: unknown) {
  const codes: Record<string, string> = {
    ASSIGNMENT_REQUIRED:
      'Người nhận cần phân công hiện hành cho tất cả môn trong lịch sử tài liệu.',
    COURSE_UNAVAILABLE:
      'Có môn hoặc khoa đã ngừng hoạt động. Kiểm tra danh mục trước khi bàn giao.',
    RECIPIENT_UNAVAILABLE: 'Người nhận không còn là giảng viên hoạt động đã xác minh.',
    MATERIAL_UNAVAILABLE:
      'Bản hiện hành chưa đủ điều kiện: đã duyệt, PDF an toàn và còn quyền sử dụng.',
    STALE_REVISION: 'Tài liệu đã thay đổi ở lượt khác.',
    VISIBILITY_UNCHANGED: 'Tài liệu đã ở trạng thái này.',
    RESOLUTION_REQUIRED: 'Xác nhận lý do ẩn đã được giải quyết trước khi khôi phục.',
    TRANSFER_NOT_ALLOWED: 'Chỉ bàn giao học liệu giảng viên.',
    SAME_MANAGER: 'Người nhận đang quản lý tài liệu.',
  };
  return e instanceof ApiError && e.code && codes[e.code] ? codes[e.code] : academicError(e);
}
