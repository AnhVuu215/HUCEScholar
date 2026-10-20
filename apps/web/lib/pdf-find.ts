export type PdfTextMatch = { pageNumber: number; start: number; end: number };
export type PdfTextPart = { str: string; hasEOL?: boolean };
export function pdfTextParts(items: unknown[]): PdfTextPart[] {
  return items.flatMap((item) =>
    item && typeof item === 'object' && 'str' in item && typeof item.str === 'string'
      ? [{ str: item.str, hasEOL: 'hasEOL' in item && item.hasEOL === true }]
      : [],
  );
}
export function pdfTextLayout(parts: Array<string | PdfTextPart>) {
  let text = '';
  const segments = parts.map((raw, index) => {
    const part = typeof raw === 'string' ? { str: raw } : raw;
    const start = text.length;
    text += part.str;
    const end = text.length;
    if (part.hasEOL) text += '\n';
    return { start, end, index };
  });
  return { text, segments };
}
export type PdfFindResult = { matches: PdfTextMatch[]; scanned: number; truncated: boolean };
export type PdfFindSource = {
  numPages: number;
  getPage: (page: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>;
};
const abort = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
};
export function findPageText(
  parts: Array<string | PdfTextPart>,
  rawQuery: string,
  pageNumber: number,
): PdfTextMatch[] {
  const query = rawQuery.trim();
  if (Array.from(query).length > 100) throw new Error('Query too long');
  if (!query) return [];
  const expression = new RegExp(
    query
      .split(/\s+/)
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+'),
    'giu',
  );
  const { text } = pdfTextLayout(parts);
  const matches: PdfTextMatch[] = [];
  for (const match of text.matchAll(expression)) {
    matches.push({ pageNumber, start: match.index, end: match.index + match[0].length });
    if (matches.length === 2001) break;
  }
  return matches;
}
export async function searchPdfText(
  pdf: PdfFindSource,
  query: string,
  signal: AbortSignal,
  onBatch: (result: PdfFindResult) => void,
  checkAccess: () => Promise<unknown>,
): Promise<PdfFindResult> {
  let result: PdfFindResult = { matches: [], scanned: 0, truncated: false };
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    abort(signal);
    if ((pageNumber - 1) % 4 === 0) {
      await checkAccess();
      abort(signal);
    }
    const page = await pdf.getPage(pageNumber);
    abort(signal);
    const content = await page.getTextContent();
    abort(signal);
    const parts = pdfTextParts(content.items);
    const matches = findPageText(parts, query, pageNumber);
    const remaining = 2000 - result.matches.length;
    result = {
      matches: [...result.matches, ...matches.slice(0, remaining)],
      scanned: pageNumber,
      truncated: matches.length > remaining,
    };
    if (pageNumber % 4 === 0 || pageNumber === pdf.numPages || result.truncated) {
      onBatch(result);
      // Yield between batches; only the current page text and bounded offsets are retained.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      abort(signal);
    }
    if (result.truncated) break;
  }
  return result;
}
type OutlineSource = {
  numPages: number;
  getDestination: (name: string) => Promise<unknown>;
  getPageIndex: (reference: { num: number; gen: number }) => Promise<number>;
};
export async function resolveOutlinePage(
  pdf: OutlineSource,
  destination: unknown,
): Promise<number | null> {
  const value: unknown =
    typeof destination === 'string' ? await pdf.getDestination(destination) : destination;
  if (!Array.isArray(value) || !value.length) return null;
  const target: unknown = value[0];
  let index: number;
  if (typeof target === 'number' && Number.isSafeInteger(target)) index = target;
  else if (
    target &&
    typeof target === 'object' &&
    'num' in target &&
    'gen' in target &&
    Number.isSafeInteger(target.num) &&
    Number(target.num) > 0 &&
    Number.isSafeInteger(target.gen) &&
    Number(target.gen) >= 0
  )
    index = await pdf.getPageIndex({ num: Number(target.num), gen: Number(target.gen) });
  else return null;
  return Number.isSafeInteger(index) && index >= 0 && index < pdf.numPages ? index + 1 : null;
}
