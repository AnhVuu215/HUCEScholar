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
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const id = (v: unknown) => typeof v === 'string' && /^[1-9]\d*$/.test(v);
export async function savedStatus(documentId: string, signal?: AbortSignal) {
  return parseState(await apiRequest(`/personal-library/saved/${documentId}`, { signal }));
}
async function parseState(response: Response) {
  const body: unknown = await response.json();
  if (!record(body) || typeof body.saved !== 'boolean') throw new Error('Invalid saved state.');
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
    !record(body) ||
    !Array.isArray(body.items) ||
    !body.items.every(
      (entry) =>
        record(entry) &&
        id(entry.documentId) &&
        (entry.material === null ||
          (isLibraryItem(entry.material) && entry.material.documentId === entry.documentId)) &&
        (kind === 'saved'
          ? typeof entry.savedAt === 'string'
          : id(entry.versionId) &&
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
