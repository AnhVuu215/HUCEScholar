import { isNumericId } from './guards';
import { apiRequest, csrfToken } from './auth';
export const highlightColors = {
  '#FFF59D': 'Vàng',
  '#A5D6A7': 'Xanh lá',
  '#90CAF9': 'Xanh dương',
  '#F8BBD0': 'Hồng',
  '#CE93D8': 'Tím',
  '#FFCC80': 'Cam',
  '#80CBC4': 'Xanh ngọc',
  '#B0BEC5': 'Xám',
} as const;
export type HighlightColor = keyof typeof highlightColors;
export function isHighlightColor(value: unknown): value is HighlightColor {
  return typeof value === 'string' && Object.hasOwn(highlightColors, value);
}
export function highlightColorLabel(color: string): string {
  return isHighlightColor(color) ? highlightColors[color] : `Màu đã lưu (${color.toUpperCase()})`;
}
export interface HighlightAnchor {
  coordinateSpace: 'normalized-pdf-v1';
  quote: string;
  quads: number[][];
}
export interface TextHighlight {
  id: string;
  versionId: string;
  pageNumber: number;
  kind: 'TEXT_HIGHLIGHT';
  anchor: HighlightAnchor;
  content: string;
  color: string;
  revision: number;
  updatedAt: string;
  reviewLater: boolean;
}
export function isHighlight(v: unknown): v is TextHighlight {
  if (!v || typeof v !== 'object') return false;
  const r = v as TextHighlight,
    a = r.anchor;
  return (
    isNumericId(r.id) &&
    isNumericId(r.versionId) &&
    Number.isSafeInteger(r.pageNumber) &&
    r.pageNumber > 0 &&
    Number.isSafeInteger(r.revision) &&
    r.revision > 0 &&
    r.kind === 'TEXT_HIGHLIGHT' &&
    typeof r.content === 'string' &&
    Array.from(r.content).length <= 4000 &&
    typeof r.color === 'string' &&
    /^#[0-9a-f]{6}$/i.test(r.color) &&
    typeof r.updatedAt === 'string' &&
    typeof r.reviewLater === 'boolean' &&
    !!a &&
    a.coordinateSpace === 'normalized-pdf-v1' &&
    typeof a.quote === 'string' &&
    a.quote.length > 0 &&
    a.quote.length <= 2000 &&
    Array.isArray(a.quads) &&
    a.quads.length > 0 &&
    a.quads.length <= 100 &&
    a.quads.every(
      (q) =>
        Array.isArray(q) &&
        q.length === 8 &&
        q.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1),
    )
  );
}
const base = (id: string) => `/library/versions/${encodeURIComponent(id)}/highlights`;
export async function readHighlights(
  id: string,
  page: number,
  signal: AbortSignal,
): Promise<TextHighlight[]> {
  const items: TextHighlight[] = [],
    cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ pageNumber: String(page) });
    if (cursor) params.set('cursor', cursor);
    const body: unknown = await (await apiRequest(base(id) + '?' + params, { signal })).json();
    if (
      !body ||
      typeof body !== 'object' ||
      !('items' in body) ||
      !Array.isArray(body.items) ||
      !body.items.every(isHighlight) ||
      !body.items.every((item) => item.versionId === id && item.pageNumber === page) ||
      !('nextCursor' in body) ||
      !(body.nextCursor === null || isNumericId(body.nextCursor)) ||
      (body.nextCursor !== null && cursors.has(body.nextCursor))
    )
      throw new Error('Invalid highlights response');
    items.push(...body.items);
    cursor = body.nextCursor;
    if (cursor) cursors.add(cursor);
  } while (cursor && !signal.aborted);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  return items;
}
export async function writeHighlight(
  id: string,
  note: TextHighlight | null,
  data: {
    pageNumber: number;
    content: string;
    color: HighlightColor;
    anchor: HighlightAnchor;
    requestId: string;
  },
) {
  const token = await csrfToken();
  const response = await apiRequest(base(id) + (note ? '/' + encodeURIComponent(note.id) : ''), {
    method: note ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify(
      note ? { content: data.content, color: data.color, revision: note.revision } : data,
    ),
  });
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== 'object' ||
    !('item' in body) ||
    !isHighlight(body.item) ||
    body.item.versionId !== id ||
    body.item.pageNumber !== data.pageNumber
  )
    throw new Error('Invalid highlight response');
  return body.item;
}
export async function removeHighlight(id: string, note: TextHighlight) {
  const token = await csrfToken();
  await apiRequest(base(id) + '/' + encodeURIComponent(note.id), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify({ revision: note.revision }),
  });
}
