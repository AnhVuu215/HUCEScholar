export type CitationSource = {
  quote: string;
  title: string;
  authors?: string;
  versionNo: number;
  versionId: string;
  pageNumber: number;
  origin: string;
};

/** PDF page numbers, independent of printed page labels or a document's current version. */
export function parseCitationPage(value: string | string[] | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : null;
}

export function formatCitation(source: CitationSource): string {
  const origin = new URL(source.origin);
  if (
    !['https:', 'http:'].includes(origin.protocol) ||
    origin.origin !== source.origin ||
    !/^[1-9]\d*$/.test(source.versionId) ||
    !Number.isSafeInteger(source.versionNo) ||
    source.versionNo < 1 ||
    !Number.isSafeInteger(source.pageNumber) ||
    source.pageNumber < 1 ||
    !source.quote.trim() ||
    source.quote.length > 2000 ||
    !source.title.trim()
  )
    throw new Error('Invalid citation source');
  const link = new URL(`/workspace/library/versions/${source.versionId}`, origin);
  link.searchParams.set('page', String(source.pageNumber));
  const attribution = [
    source.title.trim(),
    source.authors?.trim(),
    `phiên bản ${source.versionNo}`,
    `trang PDF ${source.pageNumber}`,
  ]
    .filter(Boolean)
    .join('; ');
  return `“${source.quote}” — ${attribution}. ${link.href}`;
}
