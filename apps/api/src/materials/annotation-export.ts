/** Owner-only export of notes and highlights: one version (EXPORT-01) or the notebook (EXPORT-02). No PDF bytes. */
export type ExportFormat = 'markdown' | 'text';
export type ExportSource = {
  title: string;
  authors: string;
  versionNo: number;
  exportedAt: Date;
};
export type ExportAnnotation = {
  page_number: number;
  kind: string;
  content: string;
  anchor: unknown;
  color: string;
  /** LEARN-02: the owner's private "cần xem lại" mark, labelled in the file. */
  review_later?: boolean;
};

export const MAX_EXPORT_ANNOTATIONS = 5000;
export const colorNames: Record<string, string> = {
  '#FFF59D': 'vàng',
  '#A5D6A7': 'xanh lá',
  '#90CAF9': 'xanh dương',
  '#F8BBD0': 'hồng',
  '#CE93D8': 'tím',
  '#FFCC80': 'cam',
  '#80CBC4': 'xanh ngọc',
  '#B0BEC5': 'xám',
};

/** Normalizes newlines and drops control characters other than tab and newline. */
function clean(value: string) {
  return value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
}
/**
 * Escapes inline syntax, line-leading block markers and bare-URL autolinks, so a note can
 * never become a link, an image, raw HTML, a list or a heading in a Markdown viewer, while
 * ordinary punctuation stays readable in the raw file.
 */
export function escapeMarkdown(value: string) {
  return clean(value)
    .replace(/[\\`*_[\]<>#!|~&()]/g, '\\$&')
    .replace(/^(\s*)([-+=])/gm, '$1\\$2')
    .replace(/^(\s*\d+)([.)])/gm, '$1\\$2')
    .replace(/:\/\//g, '\\://')
    .replace(/\bwww\./gi, (m) => `${m.slice(0, 3)}\\.`);
}
function lines(value: string, prefix = '') {
  // A trailing backslash is a CommonMark hard line break; it keeps the user's line breaks.
  return escapeMarkdown(value)
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\\\n');
}
function quoteOf(anchor: unknown) {
  return anchor &&
    typeof anchor === 'object' &&
    'quote' in anchor &&
    typeof anchor.quote === 'string'
    ? anchor.quote
    : '';
}
function stamp(date: Date) {
  return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function byPage(rows: ExportAnnotation[]) {
  const pages = new Map<number, ExportAnnotation[]>();
  for (const row of rows) pages.set(row.page_number, [...(pages.get(row.page_number) ?? []), row]);
  return [...pages.entries()].sort(([a], [b]) => a - b);
}
const REVIEW_LABEL = 'Cần xem lại';
function textPages(rows: ExportAnnotation[], out: string[]) {
  for (const [page, items] of byPage(rows)) {
    out.push('', `TRANG ${page}`);
    for (const item of items) {
      const mark = item.review_later ? ` [${REVIEW_LABEL}]` : '';
      if (item.kind === 'TEXT_HIGHLIGHT') {
        out.push(
          `- Đoạn tô (${colorNames[item.color] ?? 'màu khác'})${mark}: “${clean(quoteOf(item.anchor))}”`,
        );
        if (item.content.trim())
          out.push(`  Ghi chú: ${clean(item.content).replace(/\n/g, '\n  ')}`);
      } else out.push(`- Ghi chú trang${mark}: ${clean(item.content).replace(/\n/g, '\n  ')}`);
    }
  }
}
/** Pages as Markdown headings of the given level (2 for one document, 3 inside a notebook). */
function markdownPages(rows: ExportAnnotation[], out: string[], level: number) {
  for (const [page, items] of byPage(rows)) {
    out.push('', `${'#'.repeat(level)} Trang ${page}`);
    for (const item of items) {
      out.push('');
      const mark = item.review_later ? ` · ${REVIEW_LABEL}` : '';
      if (item.kind === 'TEXT_HIGHLIGHT') {
        out.push(
          `**Đoạn tô ${colorNames[item.color] ?? 'màu khác'}**${mark}`,
          '',
          lines(quoteOf(item.anchor), '> '),
        );
        if (item.content.trim()) out.push('', lines(item.content));
      } else out.push(`**Ghi chú trang**${mark}`, '', lines(item.content));
    }
  }
}
const empty = 'Chưa có ghi chú hoặc đoạn tô nào.';

export function exportAnnotations(
  source: ExportSource,
  rows: ExportAnnotation[],
  format: ExportFormat,
) {
  const notice = 'Chỉ gồm ghi chú và đoạn tô riêng của bạn trên phiên bản này. Không kèm file PDF.';
  if (format === 'text') {
    const out = [
      `Ghi chú: ${clean(source.title)}`,
      `Tác giả: ${clean(source.authors)}`,
      `Phiên bản ${source.versionNo} · Xuất lúc ${stamp(source.exportedAt)}`,
      notice,
    ];
    if (!rows.length) out.push('', empty);
    textPages(rows, out);
    return `${out.join('\n')}\n`;
  }
  const out = [
    `# Ghi chú — ${escapeMarkdown(source.title)}`,
    '',
    `- Tác giả: ${escapeMarkdown(source.authors)}`,
    `- Phiên bản ${source.versionNo} · Xuất lúc ${escapeMarkdown(stamp(source.exportedAt))}`,
    `- ${escapeMarkdown(notice)}`,
  ];
  if (!rows.length) out.push('', escapeMarkdown(empty));
  markdownPages(rows, out, 2);
  return `${out.join('\n')}\n`;
}

/** EXPORT-02: one document of a notebook export, with its notes in page order. */
export type NotebookDocument = Omit<ExportSource, 'exportedAt'> & { rows: ExportAnnotation[] };

/**
 * EXPORT-02: the library notebook (LEARN-03) under the owner's filters, one section per document
 * in the order given. `filters` describes the filters in words, so the file says what it holds.
 */
export function exportNotebook(
  documents: NotebookDocument[],
  meta: { filters: string; exportedAt: Date },
  format: ExportFormat,
) {
  const notice =
    'Chỉ gồm ghi chú và đoạn tô riêng của bạn trên các tài liệu còn mở được. Không kèm file PDF.';
  if (format === 'text') {
    const out = [
      'SỔ TAY GHI CHÚ',
      `Xuất lúc ${stamp(meta.exportedAt)}`,
      `Bộ lọc: ${clean(meta.filters)}`,
      notice,
    ];
    if (!documents.length) out.push('', empty);
    for (const doc of documents) {
      out.push(
        '',
        `=== ${clean(doc.title)} · Phiên bản ${doc.versionNo} ===`,
        `Tác giả: ${clean(doc.authors)}`,
      );
      textPages(doc.rows, out);
    }
    return `${out.join('\n')}\n`;
  }
  const out = [
    '# Sổ tay ghi chú',
    '',
    `- Xuất lúc ${escapeMarkdown(stamp(meta.exportedAt))}`,
    `- Bộ lọc: ${escapeMarkdown(meta.filters)}`,
    `- ${escapeMarkdown(notice)}`,
  ];
  if (!documents.length) out.push('', escapeMarkdown(empty));
  for (const doc of documents) {
    out.push(
      '',
      `## ${escapeMarkdown(doc.title)} · phiên bản ${doc.versionNo}`,
      '',
      `- Tác giả: ${escapeMarkdown(doc.authors)}`,
    );
    markdownPages(doc.rows, out, 3);
  }
  return `${out.join('\n')}\n`;
}
