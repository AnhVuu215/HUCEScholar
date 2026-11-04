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
const SNIPPET_CONTEXT = 70;

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
 * The part of a page to show for a query, cut around the whole phrase or else the first word found.
 * Folding can change a string's length, so positions are mapped back to the original characters.
 * The parts are plain text for the client to render; nothing here is markup.
 */
export function matchSnippet(text: string, query: string) {
  const characters = Array.from(text);
  let folded = '';
  const origin: number[] = [];
  characters.forEach((character, index) => {
    for (const unit of foldVietnamese(character)) {
      folded += unit;
      origin.push(index);
    }
  });
  const words = foldedWords(query);
  const found = [words.join(' '), ...words]
    .map((needle) => ({ needle, at: needle ? folded.indexOf(needle) : -1 }))
    .find(({ at }) => at >= 0);
  if (!found) {
    const head = characters.slice(0, SNIPPET_CONTEXT * 2);
    return {
      before: '',
      match: '',
      after: head.join('') + (characters.length > head.length ? '…' : ''),
    };
  }
  const start = origin[found.at];
  let end = origin[found.at + found.needle.length - 1] + 1;
  // Combining marks fold to nothing, so they follow the last matched letter.
  while (end < characters.length && !foldVietnamese(characters[end])) end++;
  const from = Math.max(0, start - SNIPPET_CONTEXT);
  const to = Math.min(characters.length, end + SNIPPET_CONTEXT);
  return {
    before: (from > 0 ? '…' : '') + characters.slice(from, start).join(''),
    match: characters.slice(start, end).join(''),
    after: characters.slice(end, to).join('') + (to < characters.length ? '…' : ''),
  };
}

/**
 * The whole query as one LIKE pattern, words in the order typed and separated by single spaces.
 * Used only to rank: a title containing the exact phrase comes before scattered word matches.
 */
export function foldedPhrase(value: string): string {
  return contains(foldedWords(value).join(' '));
}
