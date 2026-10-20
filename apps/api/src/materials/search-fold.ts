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

/** A LIKE pattern matching the folded text anywhere; user wildcards are literal. */
export function foldedContains(value: string): string {
  return `%${foldVietnamese(value).replace(/[\\%_]/g, '\\$&')}%`;
}
