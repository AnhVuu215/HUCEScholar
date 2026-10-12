import { ApiError, apiRequest } from './auth';
export interface LibraryItem {
  documentId: string;
  versionId: string;
  versionNo: number;
  title: string;
  authors: string;
  description: string;
  materialType: 'TEXTBOOK' | 'LECTURE' | 'EXERCISE' | 'EXAM' | 'REFERENCE' | 'OTHER';
  kind: string;
  current: boolean;
  sourceReference: string;
  rightsBasis: string;
  rightsValidUntil: string | null;
  downloadAllowed: boolean;
  pageCount: number;
  hasTextLayer: boolean;
  byteSize: number;
  courses: { id: string; code: string; name: string }[];
}
export interface LibraryList {
  items: LibraryItem[];
  total: number;
  page: number;
  limit: number;
}
export function isLibraryItem(value: unknown): value is LibraryItem {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    ['documentId', 'versionId'].every(
      (k) => typeof r[k] === 'string' && /^[1-9]\d*$/.test(r[k] as string),
    ) &&
    [
      'title',
      'authors',
      'description',
      'materialType',
      'kind',
      'sourceReference',
      'rightsBasis',
    ].every((k) => typeof r[k] === 'string') &&
    ['versionNo', 'pageCount', 'byteSize'].every(
      (k) => Number.isSafeInteger(r[k]) && Number(r[k]) > 0,
    ) &&
    typeof r.downloadAllowed === 'boolean' &&
    typeof r.hasTextLayer === 'boolean' &&
    typeof r.current === 'boolean' &&
    (r.rightsValidUntil === null || typeof r.rightsValidUntil === 'string') &&
    Array.isArray(r.courses) &&
    r.courses.every(
      (c) =>
        c &&
        typeof c === 'object' &&
        typeof c.id === 'string' &&
        typeof c.code === 'string' &&
        typeof c.name === 'string',
    )
  );
}
export async function libraryList(
  query: URLSearchParams,
  signal: AbortSignal,
): Promise<LibraryList> {
  const r: unknown = await (await apiRequest(`/library?${query}`, { signal })).json();
  if (
    !r ||
    typeof r !== 'object' ||
    !('items' in r) ||
    !Array.isArray(r.items) ||
    !r.items.every(isLibraryItem) ||
    !('total' in r) ||
    !Number.isSafeInteger(r.total) ||
    !('page' in r) ||
    !Number.isSafeInteger(r.page) ||
    !('limit' in r) ||
    !Number.isSafeInteger(r.limit)
  )
    throw new Error('Invalid library response.');
  return r as LibraryList;
}
export async function libraryVersion(id: string, signal?: AbortSignal): Promise<LibraryItem> {
  const r: unknown = await (
    await apiRequest(`/library/versions/${encodeURIComponent(id)}`, { signal })
  ).json();
  if (!r || typeof r !== 'object' || !('item' in r) || !isLibraryItem(r.item))
    throw new Error('Invalid library version.');
  return r.item;
}
export async function libraryCourses(signal: AbortSignal): Promise<LibraryItem['courses']> {
  const body: unknown = await (await apiRequest('/library/courses', { signal })).json();
  if (
    !body ||
    typeof body !== 'object' ||
    !('items' in body) ||
    !Array.isArray(body.items) ||
    !body.items.every(
      (c) =>
        c &&
        typeof c === 'object' &&
        typeof c.id === 'string' &&
        /^[1-9]\d*$/.test(c.id) &&
        typeof c.code === 'string' &&
        typeof c.name === 'string',
    )
  )
    throw new Error('Invalid library courses.');
  return body.items;
}
export function libraryError(error: unknown) {
  if (error instanceof ApiError && error.status === 401)
    return 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.';
  if (error instanceof ApiError && [403, 404].includes(error.status))
    return 'Học liệu không còn khả dụng hoặc bạn không có quyền đọc. Quay lại kho để chọn tài liệu khác.';
  return 'Chưa tải được học liệu. Kiểm tra kết nối rồi thử lại.';
}
