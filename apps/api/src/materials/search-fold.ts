/**
 * Accent- and case-insensitive form of Vietnamese text. Must match the SQL function
 * hucescholar.fold_vi (migration 202610200002_fold_vi); an integration test compares both.
 */
export function foldVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export const MAX_SEARCH_TERMS = 10;

/**
 * One LIKE pattern per distinct folded word; a match must contain every word, in any order.
 * User wildcards are literal (backslash is PostgreSQL's default LIKE escape). Words past
 * MAX_SEARCH_TERMS are ignored: by then the query is already specific.
 */
export function foldedTerms(value: string): string[] {
  const words = new Set(foldVietnamese(value).split(/\s+/).filter(Boolean));
  return [...words]
    .slice(0, MAX_SEARCH_TERMS)
    .map((word) => `%${word.replace(/[\\%_]/g, '\\$&')}%`);
}
