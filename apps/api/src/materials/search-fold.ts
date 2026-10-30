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

/** Folded words in the order typed. */
const foldedWords = (value: string) => foldVietnamese(value).split(/\s+/).filter(Boolean);

/** `%text%` with user wildcards literal (backslash is PostgreSQL's default LIKE escape). */
const contains = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

/**
 * One LIKE pattern per distinct folded word; a match must contain every word, in any order.
 * Words past MAX_SEARCH_TERMS are ignored: by then the query is already specific.
 */
export function foldedTerms(value: string): string[] {
  return [...new Set(foldedWords(value))].slice(0, MAX_SEARCH_TERMS).map(contains);
}

/**
 * The whole query as one LIKE pattern, words in the order typed and separated by single spaces.
 * Used only to rank: a title containing the exact phrase comes before scattered word matches.
 */
export function foldedPhrase(value: string): string {
  return contains(foldedWords(value).join(' '));
}
