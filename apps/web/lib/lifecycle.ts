import { isRecord, isNumericId } from './guards';
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
    /** Handovers recorded before ROLE-01; read-only history. */
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
const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
const version = (v: unknown): v is Version =>
  isRecord(v) &&
  isNumericId(v.id) &&
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
    isRecord(v) &&
    isNumericId(v.id) &&
    ['VISIBLE', 'HIDDEN'].includes(String(v.visibility)) &&
    integer(v.revision) &&
    Number(v.revision) > 0 &&
    isRecord(v.manager) &&
    isNumericId(v.manager.id) &&
    typeof v.manager.name === 'string' &&
    version(v.latest) &&
    (v.currentVersionId === null || isNumericId(v.currentVersionId))
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
      (c) =>
        isRecord(c) &&
        isNumericId(c.id) &&
        typeof c.code === 'string' &&
        typeof c.name === 'string',
    ) &&
    isRecord(h) &&
    ['totalTransfers', 'totalVisibility', 'page', 'limit'].every((k) => integer(h[k])) &&
    Array.isArray(h.transfers) &&
    h.transfers.every(
      (t) =>
        isRecord(t) &&
        isNumericId(t.id) &&
        isNumericId(t.fromUserId) &&
        isNumericId(t.toUserId) &&
        typeof t.fromName === 'string' &&
        typeof t.toName === 'string' &&
        isNumericId(t.performedBy) &&
        typeof t.reason === 'string' &&
        typeof t.createdAt === 'string',
    ) &&
    Array.isArray(h.visibility) &&
    h.visibility.every(
      (t) =>
        isRecord(t) &&
        isNumericId(t.id) &&
        isNumericId(t.performedBy) &&
        ['VISIBLE', 'HIDDEN'].includes(String(t.fromVisibility)) &&
        ['VISIBLE', 'HIDDEN'].includes(String(t.toVisibility)) &&
        typeof t.reason === 'string' &&
        typeof t.createdAt === 'string',
    )
  );
}
async function readItem(response: Response) {
  const data: unknown = await response.json();
  if (isRecord(data) && detail(data.item)) return data.item;
  throw new Error('Invalid lifecycle response.');
}
export async function managedMaterials(
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<List> {
  if (!params.get('visibility')) params.delete('visibility');
  const data: unknown = await (await apiRequest(`/admin/materials?${params}`, { signal })).json();
  if (
    isRecord(data) &&
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
export async function changeMaterial(
  current: MaterialLifecycle,
  action: 'visibility',
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
    MATERIAL_UNAVAILABLE:
      'Bản hiện hành chưa đủ điều kiện: đã duyệt, PDF an toàn và còn quyền sử dụng.',
    STALE_REVISION: 'Tài liệu đã thay đổi ở lượt khác.',
    VISIBILITY_UNCHANGED: 'Tài liệu đã ở trạng thái này.',
    RESOLUTION_REQUIRED: 'Xác nhận lý do ẩn đã được giải quyết trước khi khôi phục.',
  };
  return e instanceof ApiError && e.code && codes[e.code] ? codes[e.code] : academicError(e);
}
