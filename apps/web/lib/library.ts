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
  publicationMethod: 'ADMIN_REVIEW' | 'LECTURER_SELF';
  current: boolean;
  sourceReference: string;
  rightsBasis: string;
  rightsValidUntil: string | null;
  downloadAllowed: boolean;
  pageCount: number;
  hasTextLayer: boolean;
  /** The PDF opens freely but its author forbids copying: no text highlights or citations. */
  copyRestricted: boolean;
  byteSize: number;
  sourceFile?: { name: string; byteSize: number; format: 'DOCX' } | null;
  courses: { id: string; code: string; name: string }[];
  /** Set only on an earlier version whose document's current version is readable. */
  currentVersion?: { versionId: string; versionNo: number; title: string } | null;
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
    ['ADMIN_REVIEW', 'LECTURER_SELF'].includes(String(r.publicationMethod)) &&
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
    typeof r.copyRestricted === 'boolean' &&
    typeof r.current === 'boolean' &&
    (r.sourceFile == null ||
      (typeof r.sourceFile === 'object' &&
        'format' in r.sourceFile &&
        r.sourceFile.format === 'DOCX' &&
        'name' in r.sourceFile &&
        typeof r.sourceFile.name === 'string' &&
        'byteSize' in r.sourceFile &&
        Number.isSafeInteger(r.sourceFile.byteSize))) &&
    (r.rightsValidUntil === null || typeof r.rightsValidUntil === 'string') &&
    (r.currentVersion == null ||
      (r.current === false &&
        typeof r.currentVersion === 'object' &&
        'versionId' in r.currentVersion &&
        typeof r.currentVersion.versionId === 'string' &&
        /^[1-9]\d*$/.test(r.currentVersion.versionId) &&
        r.currentVersion.versionId !== r.versionId &&
        'versionNo' in r.currentVersion &&
        Number.isSafeInteger(r.currentVersion.versionNo) &&
        'title' in r.currentVersion &&
        typeof r.currentVersion.title === 'string')) &&
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
/** HTTP status of an API error, or of pdf.js's ResponseException when it fetched the PDF itself. */
function statusOf(error: unknown) {
  if (error instanceof ApiError) return error.status;
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
}
/** 410 FILE_MISSING: the version still exists but its PDF is gone from the server. */
export function pdfMissing(error: unknown) {
  return statusOf(error) === 410;
}
export function libraryError(error: unknown) {
  if (pdfMissing(error))
    return 'File PDF của phiên bản này không còn trên máy chủ. Thử lại cũng không mở được; hãy báo cho người tải lên hoặc quản trị viên bằng “Báo cáo tài liệu”.';
  if (error instanceof ApiError && error.status === 401)
    return 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.';
  if ([403, 404].includes(statusOf(error) ?? 0))
    return 'Học liệu không còn khả dụng hoặc bạn không có quyền đọc. Quay lại kho để chọn tài liệu khác.';
  return 'Chưa tải được học liệu. Kiểm tra kết nối rồi thử lại.';
}
