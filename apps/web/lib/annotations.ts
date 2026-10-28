import { apiRequest, csrfToken } from './auth';
import { isNote, type PageNote } from './reading';
import { isHighlight, type HighlightColor, type TextHighlight } from './highlights';

export type AnnotationItem = PageNote | TextHighlight;
export type AnnotationFilters = {
  query?: string;
  kind?: AnnotationItem['kind'];
  color?: HighlightColor;
  reviewLater?: true;
};
export async function searchAnnotations(
  versionId: string,
  filters: AnnotationFilters,
  cursor: string | null,
  signal: AbortSignal,
): Promise<{ items: AnnotationItem[]; nextCursor: string | null }> {
  const token = await csrfToken();
  const body: unknown = await (
    await apiRequest(`/library/versions/${encodeURIComponent(versionId)}/annotations/search`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify({ ...filters, ...(cursor ? { cursor } : {}), limit: 20 }),
    })
  ).json();
  if (
    !body ||
    typeof body !== 'object' ||
    !('items' in body) ||
    !Array.isArray(body.items) ||
    body.items.length > 20 ||
    !body.items.every(
      (item: unknown): item is AnnotationItem => isNote(item) || isHighlight(item),
    ) ||
    !body.items.every((item) => item.versionId === versionId) ||
    !body.items.every(
      (item, i, items) =>
        !i ||
        item.pageNumber > items[i - 1].pageNumber ||
        (item.pageNumber === items[i - 1].pageNumber && BigInt(item.id) > BigInt(items[i - 1].id)),
    ) ||
    !('nextCursor' in body) ||
    !(
      body.nextCursor === null ||
      (typeof body.nextCursor === 'string' &&
        /^[A-Za-z0-9_-]{1,256}$/.test(body.nextCursor) &&
        body.nextCursor !== cursor)
    ) ||
    (body.nextCursor !== null && body.items.length === 0)
  )
    throw new Error('Invalid annotation search response');
  return { items: body.items, nextCursor: body.nextCursor };
}
/** Sets the owner's private "Cần xem lại" mark; the content revision does not change. */
export async function setReviewLater(
  versionId: string,
  item: AnnotationItem,
  reviewLater: boolean,
): Promise<AnnotationItem> {
  const token = await csrfToken();
  const body: unknown = await (
    await apiRequest(
      `/library/versions/${encodeURIComponent(versionId)}/annotations/${encodeURIComponent(item.id)}/review-later`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ reviewLater }),
      },
    )
  ).json();
  if (
    !body ||
    typeof body !== 'object' ||
    !('item' in body) ||
    !(isNote(body.item) || isHighlight(body.item)) ||
    body.item.id !== item.id ||
    body.item.reviewLater !== reviewLater
  )
    throw new Error('Invalid review mark response');
  return body.item;
}
export type NotesExportFormat = 'markdown' | 'text';
/** The owner's notes for one version as a file; the API re-checks read access each time. */
export async function exportNotes(versionId: string, format: NotesExportFormat) {
  const response = await apiRequest(
    `/library/versions/${encodeURIComponent(versionId)}/annotations/export?format=${format}`,
    {},
    20_000,
  );
  return downloadedFile(response, 'ghi-chu', format);
}
/** The file an export response carries, named by its header or a fallback. */
export async function downloadedFile(
  response: Response,
  fallback: string,
  format: NotesExportFormat,
) {
  const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1];
  return {
    blob: await response.blob(),
    name: name ?? `${fallback}.${format === 'text' ? 'txt' : 'md'}`,
  };
}
