/** SEARCH-04. A file stops being retried after this many failed text extractions. */
export const TEXT_INDEX_MAX_ATTEMPTS = 3;

export type TextIndexFile = {
  scan_status: string;
  has_text_layer: boolean | null;
  copy_restricted: boolean;
  file_text: {
    pages: number;
    truncated: boolean;
    attempts: number;
    indexed_at: Date | null;
  } | null;
} | null;

/**
 * What the content search knows about one PDF, for admins. Mirrors the conditions the indexer
 * sweep uses, so "PENDING" means the worker will still pick the file up.
 */
export function textIndexState(file: TextIndexFile) {
  if (!file || file.scan_status !== 'SAFE') return { state: 'UNAVAILABLE' as const };
  if (file.copy_restricted) return { state: 'COPY_RESTRICTED' as const };
  if (!file.has_text_layer) return { state: 'NO_TEXT' as const };
  const text = file.file_text;
  if (text?.indexed_at)
    return {
      state: 'INDEXED' as const,
      pages: text.pages,
      truncated: text.truncated,
      indexedAt: text.indexed_at.toISOString(),
    };
  const attempts = text?.attempts ?? 0;
  return attempts >= TEXT_INDEX_MAX_ATTEMPTS
    ? { state: 'FAILED' as const, attempts }
    : { state: 'PENDING' as const, attempts };
}
