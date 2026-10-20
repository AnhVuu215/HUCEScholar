import { ApiError, apiRequest, csrfToken } from './auth';
export interface PageNote {
  id: string;
  versionId: string;
  pageNumber: number;
  kind: 'PAGE_NOTE';
  content: string;
  revision: number;
  updatedAt: string;
}
export interface ReadingProgress {
  versionId: string;
  pageNumber: number;
  revision: number;
  updatedAt: string;
}
const validId = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d*$/.test(v);
function isProgress(v: unknown): v is ReadingProgress {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    validId(r.versionId) &&
    Number.isSafeInteger(r.pageNumber) &&
    Number(r.pageNumber) > 0 &&
    Number.isSafeInteger(r.revision) &&
    Number(r.revision) > 0 &&
    typeof r.updatedAt === 'string'
  );
}
export function isNote(v: unknown): v is PageNote {
  if (!isProgress(v)) return false;
  const r = v as unknown as Record<string, unknown>;
  return validId(r.id) && r.kind === 'PAGE_NOTE' && typeof r.content === 'string';
}
const base = (id: string) => `/library/versions/${encodeURIComponent(id)}`;
async function write(id: string, path: string, method: string, data: object) {
  const token = await csrfToken();
  return apiRequest(base(id) + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify(data),
  });
}
async function noteResponse(response: Response): Promise<PageNote> {
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('item' in body) || !isNote(body.item))
    throw new Error('Invalid note response');
  return body.item;
}
export async function readNotes(
  id: string,
  page: number,
  cursor: string | null,
  signal: AbortSignal,
): Promise<{ items: PageNote[]; nextCursor: string | null }> {
  const query = new URLSearchParams({ pageNumber: String(page) });
  if (cursor) query.set('cursor', cursor);
  const body: unknown = await (await apiRequest(base(id) + '/notes?' + query, { signal })).json();
  if (
    !body ||
    typeof body !== 'object' ||
    !('items' in body) ||
    !Array.isArray(body.items) ||
    !body.items.every(isNote) ||
    !('nextCursor' in body) ||
    !(body.nextCursor === null || validId(body.nextCursor))
  )
    throw new Error('Invalid notes response');
  return { items: body.items, nextCursor: body.nextCursor };
}
export async function createNote(
  id: string,
  data: { pageNumber: number; content: string; requestId: string },
) {
  return noteResponse(await write(id, '/notes', 'POST', data));
}
export async function updateNote(id: string, note: PageNote, content: string) {
  return noteResponse(
    await write(id, `/notes/${encodeURIComponent(note.id)}`, 'PATCH', {
      revision: note.revision,
      content,
    }),
  );
}
export async function removeNote(id: string, note: PageNote) {
  await write(id, `/notes/${encodeURIComponent(note.id)}`, 'DELETE', { revision: note.revision });
}
export async function readProgress(
  id: string,
  signal: AbortSignal,
): Promise<ReadingProgress | null> {
  const body: unknown = await (await apiRequest(base(id) + '/progress', { signal })).json();
  if (
    !body ||
    typeof body !== 'object' ||
    !('item' in body) ||
    !(body.item === null || isProgress(body.item))
  )
    throw new Error('Invalid progress response');
  return body.item;
}
export async function saveProgress(
  id: string,
  pageNumber: number,
  revision: number,
): Promise<ReadingProgress> {
  const body: unknown = await (
    await write(id, '/progress', 'PUT', { pageNumber, revision })
  ).json();
  if (!body || typeof body !== 'object' || !('item' in body) || !isProgress(body.item))
    throw new Error('Invalid progress response');
  return body.item;
}
export function personalError(error: unknown) {
  if (error instanceof ApiError && error.status === 401)
    return 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.';
  if (error instanceof ApiError && [403, 404].includes(error.status))
    return 'Học liệu hoặc ghi chú không còn khả dụng. Quay lại kho hoặc tải lại danh sách.';
  if (error instanceof ApiError && error.status === 400)
    return 'Kiểm tra nội dung và số trang rồi thử lại.';
  return 'Chưa xác nhận được lần lưu. Nội dung vẫn được giữ; thử lưu lại cùng yêu cầu hoặc tải lại danh sách để đối soát.';
}
