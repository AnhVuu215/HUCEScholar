import { apiRequest, csrfToken } from './auth';
import type { AnnotationFilters, AnnotationItem } from './annotations';
import { isHighlight } from './highlights';
import { isLibraryItem, type LibraryItem } from './library';
import { isNote } from './reading';

/** LEARN-03: one of the signed-in user's notes or highlights, with the document it sits in. */
export type NotebookEntry = AnnotationItem & { material: LibraryItem | null };
export type NotebookFilters = AnnotationFilters & { courseId?: string };
export type NotebookCourse = { id: string; code: string; name: string };
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d*$/.test(v);

/** Searches every readable document; the text goes in a POST body, never the URL. */
export async function searchNotebook(
  filters: NotebookFilters,
  cursor: string | null,
  signal: AbortSignal,
): Promise<{ items: NotebookEntry[]; nextCursor: string | null }> {
  const token = await csrfToken();
  const body: unknown = await (
    await apiRequest('/personal-library/notebook/search', {
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
      (item: unknown): item is NotebookEntry =>
        (isNote(item) || isHighlight(item)) &&
        'material' in item &&
        (item.material === null ||
          (isLibraryItem(item.material) && item.material.versionId === item.versionId)),
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
    throw new Error('Invalid notebook response');
  return { items: body.items, nextCursor: body.nextCursor };
}

/** Courses of the readable documents the user has notes on, for the course filter. */
export async function notebookCourses(signal: AbortSignal): Promise<NotebookCourse[]> {
  const body: unknown = await (
    await apiRequest('/personal-library/notebook/courses', { signal })
  ).json();
  if (
    !body ||
    typeof body !== 'object' ||
    !('items' in body) ||
    !Array.isArray(body.items) ||
    !body.items.every(
      (c: unknown) =>
        !!c &&
        typeof c === 'object' &&
        id((c as NotebookCourse).id) &&
        typeof (c as NotebookCourse).code === 'string' &&
        typeof (c as NotebookCourse).name === 'string',
    )
  )
    throw new Error('Invalid notebook courses');
  return body.items as NotebookCourse[];
}
