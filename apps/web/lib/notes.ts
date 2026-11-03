import { ApiError, apiRequest, csrfToken } from './auth';
import { isNumericId, isRecord } from './guards';
import {
  COVERS,
  PAGE_SIZES,
  PAPER_COLORS,
  PAPERS,
  type Cover,
  type PageContent,
  type PageSize,
  type Paper,
  type PaperColor,
} from './note-model';

/** CANVAS-01 "Vở ghi" API client. Every route is owner-only on the server. */
export const PAGE_CONTENT_TYPE = 'application/vnd.hucescholar.page+json';

export type NotebookCourse = { id: string; code: string; name: string };
export type Notebook = {
  id: string;
  title: string;
  cover: Cover;
  course: NotebookCourse | null;
  defaultSize: PageSize;
  defaultPaper: Paper;
  defaultColor: PaperColor;
  revision: number;
  pageCount: number;
  firstPageId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
export type PageSummary = {
  id: string;
  position: number;
  size: PageSize;
  paper: Paper;
  paperColor: PaperColor;
  revision: number;
  updatedAt: string;
};
export type NotebookDetail = { item: Notebook; pages: PageSummary[] };
export type QuoteView =
  | {
      available: true;
      kind: string;
      quote: string;
      note: string;
      color: string;
      versionId: string;
      pageNumber: number;
      title: string;
    }
  | { available: false };
export type AssetStatus = 'CHECKING' | 'SAFE' | 'FAILED';
export type AssetInfo = { status: AssetStatus; width: number; height: number };
export type PageView = {
  page: PageSummary & { content: PageContent };
  quotes: Record<string, QuoteView>;
  assets: Record<string, AssetInfo>;
};
export type UploadedAsset = {
  id: string;
  status: AssetStatus;
  width: number;
  height: number;
  error: string | null;
  sourceHost: string | null;
};

const oneOf = <T extends string>(value: unknown, options: readonly T[]): value is T =>
  typeof value === 'string' && (options as readonly string[]).includes(value);
function isCourse(v: unknown): v is NotebookCourse {
  return (
    isRecord(v) && isNumericId(v.id) && typeof v.code === 'string' && typeof v.name === 'string'
  );
}
function isNotebook(v: unknown): v is Notebook {
  return (
    isRecord(v) &&
    isNumericId(v.id) &&
    typeof v.title === 'string' &&
    oneOf(v.cover, COVERS) &&
    (v.course === null || isCourse(v.course)) &&
    oneOf(v.defaultSize, PAGE_SIZES) &&
    oneOf(v.defaultPaper, PAPERS) &&
    oneOf(v.defaultColor, PAPER_COLORS) &&
    Number.isInteger(v.revision) &&
    Number.isInteger(v.pageCount) &&
    (v.firstPageId === null || isNumericId(v.firstPageId)) &&
    typeof v.updatedAt === 'string' &&
    (v.deletedAt === null || typeof v.deletedAt === 'string')
  );
}
function isPage(v: unknown): v is PageSummary {
  return (
    isRecord(v) &&
    isNumericId(v.id) &&
    Number.isInteger(v.position) &&
    oneOf(v.size, PAGE_SIZES) &&
    oneOf(v.paper, PAPERS) &&
    oneOf(v.paperColor, PAPER_COLORS) &&
    Number.isInteger(v.revision) &&
    typeof v.updatedAt === 'string'
  );
}
function detail(body: unknown): NotebookDetail {
  if (
    isRecord(body) &&
    isNotebook(body.item) &&
    Array.isArray(body.pages) &&
    body.pages.every(isPage)
  )
    return { item: body.item, pages: body.pages };
  throw new Error('Invalid notebook.');
}
function asset(body: unknown): UploadedAsset {
  const item = isRecord(body) ? body.item : null;
  if (
    isRecord(item) &&
    isNumericId(item.id) &&
    oneOf(item.status, ['CHECKING', 'SAFE', 'FAILED'] as const) &&
    Number.isInteger(item.width) &&
    Number.isInteger(item.height)
  )
    return item as UploadedAsset;
  throw new Error('Invalid image.');
}

async function send(path: string, method: string, body?: object, timeoutMs?: number) {
  const token = await csrfToken();
  return apiRequest(
    path,
    {
      method,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: body ? JSON.stringify(body) : undefined,
    },
    timeoutMs,
  );
}

export async function listNotebooks(
  params: { q?: string; courseId?: string; trash?: boolean },
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set('q', params.q.trim());
  if (params.courseId) search.set('courseId', params.courseId);
  if (params.trash) search.set('trash', '1');
  const body: unknown = await (await apiRequest(`/notebooks?${search}`, { signal })).json();
  if (
    isRecord(body) &&
    Array.isArray(body.items) &&
    body.items.every(isNotebook) &&
    Array.isArray(body.courses) &&
    body.courses.every(isCourse) &&
    Number.isInteger(body.trashDays)
  )
    return body as { items: Notebook[]; courses: NotebookCourse[]; trashDays: number };
  throw new Error('Invalid notebooks.');
}
export type NotebookFields = {
  title: string;
  cover: Cover;
  courseId: string | null;
  defaultSize: PageSize;
  defaultPaper: Paper;
  defaultColor: PaperColor;
};
export async function createNotebook(fields: NotebookFields, requestId = crypto.randomUUID()) {
  return detail(await (await send('/notebooks', 'POST', { ...fields, requestId })).json());
}
export async function getNotebook(id: string, signal?: AbortSignal) {
  return detail(
    await (await apiRequest(`/notebooks/${encodeURIComponent(id)}`, { signal })).json(),
  );
}
export async function updateNotebook(id: string, revision: number, fields: NotebookFields) {
  return detail(
    await (
      await send(`/notebooks/${encodeURIComponent(id)}`, 'PATCH', { ...fields, revision })
    ).json(),
  );
}
export async function trashNotebook(id: string, revision: number) {
  await send(`/notebooks/${encodeURIComponent(id)}`, 'DELETE', { revision });
}
export async function restoreNotebook(id: string) {
  return detail(await (await send(`/notebooks/${encodeURIComponent(id)}/restore`, 'POST')).json());
}
export async function purgeNotebook(id: string) {
  await send(`/notebooks/${encodeURIComponent(id)}/permanent`, 'DELETE');
}
export async function duplicateNotebook(id: string) {
  return detail(
    await (
      await send(`/notebooks/${encodeURIComponent(id)}/duplicate`, 'POST', {
        requestId: crypto.randomUUID(),
      })
    ).json(),
  );
}
/** Image storage as shown on the shelf and in Settings. */
export const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
    : bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.ceil(bytes / 1024)} KB`;
export async function notebooksUsage(signal?: AbortSignal) {
  const body: unknown = await (await apiRequest('/notebooks/usage', { signal })).json();
  if (
    isRecord(body) &&
    Number.isSafeInteger(body.imageBytes) &&
    Number.isSafeInteger(body.imageLimit) &&
    Number.isInteger(body.notebooks)
  )
    return body as {
      imageBytes: number;
      imageCount: number;
      imageLimit: number;
      notebooks: number;
    };
  throw new Error('Invalid usage.');
}

export async function createPage(
  notebookId: string,
  data: {
    afterPageId?: string | null;
    size?: PageSize;
    paper?: Paper;
    paperColor?: PaperColor;
    duplicateOf?: string;
  },
) {
  const body: unknown = await (
    await send(`/notebooks/${encodeURIComponent(notebookId)}/pages`, 'POST', {
      ...data,
      requestId: crypto.randomUUID(),
    })
  ).json();
  const result = detail(body);
  if (isRecord(body) && isPage(body.page)) return { ...result, page: body.page };
  throw new Error('Invalid page.');
}
function isQuote(v: unknown): v is QuoteView {
  return (
    isRecord(v) &&
    (v.available === false ||
      (v.available === true &&
        typeof v.quote === 'string' &&
        typeof v.note === 'string' &&
        typeof v.title === 'string' &&
        isNumericId(v.versionId) &&
        Number.isInteger(v.pageNumber)))
  );
}
export async function getPage(notebookId: string, pageId: string, signal?: AbortSignal) {
  const body: unknown = await (
    await apiRequest(
      `/notebooks/${encodeURIComponent(notebookId)}/pages/${encodeURIComponent(pageId)}`,
      { signal },
      15_000,
    )
  ).json();
  if (
    isRecord(body) &&
    isPage(body.page) &&
    isRecord((body.page as Record<string, unknown>).content) &&
    Array.isArray(
      ((body.page as Record<string, unknown>).content as Record<string, unknown>).items,
    ) &&
    isRecord(body.quotes) &&
    Object.values(body.quotes).every(isQuote) &&
    isRecord(body.assets)
  )
    return body as unknown as PageView;
  throw new Error('Invalid page.');
}
/** Autosave. 409 `NOTEBOOK_PAGE_CONFLICT` means the page changed in another tab or device. */
export async function savePageContent(
  notebookId: string,
  pageId: string,
  revision: number,
  content: PageContent,
) {
  const token = await csrfToken();
  const body: unknown = await (
    await apiRequest(
      `/notebooks/${encodeURIComponent(notebookId)}/pages/${encodeURIComponent(pageId)}/content`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': PAGE_CONTENT_TYPE,
          'If-Match': `"${revision}"`,
          'X-CSRF-Token': token,
        },
        body: JSON.stringify(content),
      },
      30_000,
    )
  ).json();
  if (isRecord(body) && Number.isInteger(body.revision)) return body.revision as number;
  throw new Error('Invalid save.');
}
export async function updatePage(
  notebookId: string,
  pageId: string,
  revision: number,
  data: { size: PageSize; paper: Paper; paperColor: PaperColor },
) {
  const body: unknown = await (
    await send(
      `/notebooks/${encodeURIComponent(notebookId)}/pages/${encodeURIComponent(pageId)}`,
      'PATCH',
      { ...data, revision },
    )
  ).json();
  if (isPage(body)) return body;
  throw new Error('Invalid page.');
}
export async function deletePage(notebookId: string, pageId: string, revision: number) {
  return detail(
    await (
      await send(
        `/notebooks/${encodeURIComponent(notebookId)}/pages/${encodeURIComponent(pageId)}`,
        'DELETE',
        { revision },
      )
    ).json(),
  );
}
export async function reorderPages(notebookId: string, order: string[]) {
  return detail(
    await (
      await send(`/notebooks/${encodeURIComponent(notebookId)}/pages/reorder`, 'POST', { order })
    ).json(),
  );
}
export async function addQuotes(notebookId: string, annotationIds: string[]) {
  const body: unknown = await (
    await send(`/notebooks/${encodeURIComponent(notebookId)}/quotes`, 'POST', {
      requestId: crypto.randomUUID(),
      annotationIds,
    })
  ).json();
  const result = detail(body);
  if (isRecord(body) && isPage(body.page)) return { ...result, page: body.page };
  throw new Error('Invalid quotes.');
}

export async function uploadImage(file: Blob) {
  const token = await csrfToken();
  return asset(
    await (
      await apiRequest(
        '/notebook-assets',
        {
          method: 'POST',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-CSRF-Token': token,
            'X-Upload-Id': crypto.randomUUID(),
          },
          body: file,
        },
        60_000,
      )
    ).json(),
  );
}
export async function imageFromUrl(url: string) {
  return asset(
    await (
      await send(
        '/notebook-assets/from-url',
        'POST',
        { url, requestId: crypto.randomUUID() },
        45_000,
      )
    ).json(),
  );
}
export async function assetStatuses(ids: string[], signal?: AbortSignal) {
  const body: unknown = await (
    await apiRequest(`/notebook-assets?ids=${ids.slice(0, 200).join(',')}`, { signal })
  ).json();
  if (isRecord(body) && Array.isArray(body.items))
    return (body.items as unknown[]).flatMap((item) => {
      try {
        return [asset({ item })];
      } catch {
        return [];
      }
    });
  throw new Error('Invalid image status.');
}
export const assetUrl = (id: string, thumb = false) =>
  `/api/v1/notebook-assets/${encodeURIComponent(id)}${thumb ? '?size=thumb' : ''}`;

export const notesPath = (notebookId: string, pageId?: string | null) =>
  `/workspace/notes/${encodeURIComponent(notebookId)}${pageId ? `?page=${encodeURIComponent(pageId)}` : ''}`;

/** Vietnamese messages for the codes the notebook API answers with. */
export function notesError(error: unknown, fallback = 'Chưa thực hiện được. Thử lại sau.') {
  if (!(error instanceof ApiError)) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  switch (error.code) {
    case 'NOTEBOOK_NOT_FOUND':
      return 'Không tìm thấy vở ghi này.';
    case 'NOTEBOOK_PAGE_NOT_FOUND':
      return 'Trang vở không còn.';
    case 'NOTEBOOK_CONFLICT':
      return 'Vở đã thay đổi ở nơi khác. Tải lại rồi thử lại.';
    case 'NOTEBOOK_PAGE_CONFLICT':
      return 'Trang đã được sửa ở nơi khác.';
    case 'NOTEBOOK_PAGE_TOO_LARGE':
      return 'Trang quá lớn (tối đa 2 MB). Chuyển bớt nội dung sang trang mới.';
    case 'NOTEBOOK_PAGE_INVALID':
      return 'Dữ liệu trang không hợp lệ. Tải lại trang vở.';
    case 'NOTEBOOK_LAST_PAGE':
      return 'Vở cần ít nhất một trang.';
    case 'NOTEBOOK_QUOTA':
      return 'Đã chạm giới hạn của vở ghi (số vở, số trang hoặc dung lượng ảnh).';
    case 'NOTEBOOK_QUOTE_UNAVAILABLE':
      return 'Có ghi chú không còn mở được. Tải lại rồi chọn lại.';
    case 'IMAGE_TOO_LARGE':
      return 'Ảnh quá lớn (tối đa 10 MB, 50 megapixel).';
    case 'IMAGE_UNSUPPORTED':
      return 'Chỉ nhận ảnh PNG, JPG, WebP, GIF hoặc AVIF.';
    case 'IMAGE_HEIC':
      return 'Ảnh HEIC (iPhone) chưa đọc được. Lưu ảnh dạng JPG hoặc PNG rồi thử lại.';
    case 'IMAGE_INVALID':
      return 'Không đọc được ảnh này. File có thể bị hỏng.';
    case 'IMAGE_BUSY':
      return 'Đang xử lý ảnh khác. Thử lại sau giây lát.';
    case 'IMAGE_URL_INVALID':
    case 'IMAGE_URL_BLOCKED':
    case 'IMAGE_FETCH_FAILED':
      return 'Không lấy được ảnh từ trang này. Hãy lưu ảnh về máy rồi kéo vào.';
  }
  if (error.status === 404) return 'Không tìm thấy vở ghi này.';
  return fallback;
}
