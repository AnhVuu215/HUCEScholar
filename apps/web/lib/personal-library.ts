import { isRecord, isNumericId } from './guards';
import { apiRequest } from './auth';
import { academicWrite } from './academic';
import { isLibraryItem, type LibraryItem } from './library';
export type PersonalListKind = 'saved' | 'recent';
export type PersonalEntry = {
  documentId: string;
  versionId?: string;
  pageNumber?: number;
  savedAt?: string;
  readAt?: string;
  material: LibraryItem | null;
};
export type PersonalList = { items: PersonalEntry[]; total: number; page: number; limit: number };
export async function savedStatus(documentId: string, signal?: AbortSignal) {
  return parseState(await apiRequest(`/personal-library/saved/${documentId}`, { signal }));
}
async function parseState(response: Response) {
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.saved !== 'boolean') throw new Error('Invalid saved state.');
  return body.saved;
}
export async function changeSaved(documentId: string, saved: boolean) {
  return parseState(
    await academicWrite(
      `/personal-library/saved/${documentId}`,
      saved ? { saved: true } : {},
      saved ? 'PUT' : 'DELETE',
    ),
  );
}
export async function personalList(
  kind: PersonalListKind,
  page: number,
  signal: AbortSignal,
): Promise<PersonalList> {
  const body: unknown = await (
    await apiRequest(`/personal-library/${kind}?page=${page}&limit=12`, { signal })
  ).json();
  if (
    !isRecord(body) ||
    !Array.isArray(body.items) ||
    !body.items.every(
      (entry) =>
        isRecord(entry) &&
        isNumericId(entry.documentId) &&
        (entry.material === null ||
          (isLibraryItem(entry.material) && entry.material.documentId === entry.documentId)) &&
        (kind === 'saved'
          ? typeof entry.savedAt === 'string'
          : isNumericId(entry.versionId) &&
            Number.isSafeInteger(entry.pageNumber) &&
            Number(entry.pageNumber) > 0 &&
            typeof entry.readAt === 'string' &&
            (entry.material === null ||
              (isLibraryItem(entry.material) && entry.material.versionId === entry.versionId))),
    ) ||
    !['total', 'page', 'limit'].every(
      (key) => Number.isSafeInteger(body[key]) && Number(body[key]) >= (key === 'total' ? 0 : 1),
    )
  )
    throw new Error('Invalid personal library.');
  return body as PersonalList;
}
/** CAL-04: one "cần xem lại" note or highlight of the signed-in user, on a readable version. */
export type ReviewLaterEntry = {
  id: string;
  versionId: string;
  pageNumber: number;
  kind: 'PAGE_NOTE' | 'TEXT_HIGHLIGHT';
  excerpt: string;
  color?: string;
  material: LibraryItem | null;
};
export type ReviewLaterList = {
  items: ReviewLaterEntry[];
  total: number;
  page: number;
  limit: number;
};
/** Narrows the "cần xem lại" list to one course and/or one document; empty means all. */
export type ReviewLaterScope = { courseId: string; versionId: string };
export type ReviewLaterFilters = {
  documents: { versionId: string; title: string; marks: number }[];
  courses: { id: string; code: string; name: string }[];
};
export async function reviewLaterList(
  page: number,
  signal: AbortSignal,
  scope: ReviewLaterScope = { courseId: '', versionId: '' },
): Promise<ReviewLaterList> {
  const params = new URLSearchParams({ page: String(page), limit: '12' });
  if (scope.courseId) params.set('courseId', scope.courseId);
  if (scope.versionId) params.set('versionId', scope.versionId);
  const body: unknown = await (
    await apiRequest(`/personal-library/review-later?${params}`, { signal })
  ).json();
  if (
    !isRecord(body) ||
    !Array.isArray(body.items) ||
    !body.items.every(
      (entry) =>
        isRecord(entry) &&
        isNumericId(entry.id) &&
        isNumericId(entry.versionId) &&
        Number.isSafeInteger(entry.pageNumber) &&
        Number(entry.pageNumber) > 0 &&
        (entry.kind === 'PAGE_NOTE' || entry.kind === 'TEXT_HIGHLIGHT') &&
        typeof entry.excerpt === 'string' &&
        (entry.material === null ||
          (isLibraryItem(entry.material) && entry.material.versionId === entry.versionId)),
    ) ||
    !['total', 'page', 'limit'].every(
      (key) => Number.isSafeInteger(body[key]) && Number(body[key]) >= (key === 'total' ? 0 : 1),
    )
  )
    throw new Error('Invalid review list.');
  return body as ReviewLaterList;
}
/** Documents and courses that have readable marks, for the calendar panel's filters. */
export async function reviewLaterFilters(signal: AbortSignal): Promise<ReviewLaterFilters> {
  const body: unknown = await (
    await apiRequest('/personal-library/review-later/filters', { signal })
  ).json();
  if (
    isRecord(body) &&
    Array.isArray(body.documents) &&
    body.documents.every(
      (d) =>
        isRecord(d) &&
        isNumericId(d.versionId) &&
        typeof d.title === 'string' &&
        Number.isSafeInteger(d.marks),
    ) &&
    Array.isArray(body.courses) &&
    body.courses.every(
      (c) =>
        isRecord(c) &&
        isNumericId(c.id) &&
        typeof c.code === 'string' &&
        typeof c.name === 'string',
    )
  )
    return body as unknown as ReviewLaterFilters;
  throw new Error('Invalid review filters.');
}
