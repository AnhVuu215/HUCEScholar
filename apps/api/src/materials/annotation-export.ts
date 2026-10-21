/** Owner-only export of one version's notes and highlights (EXPORT-01). No PDF bytes. */
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
};

export const MAX_EXPORT_ANNOTATIONS = 5000;
const colorNames: Record<string, string> = {
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

export function exportAnnotations(
  source: ExportSource,
  rows: ExportAnnotation[],
  format: ExportFormat,
) {
  const pages = new Map<number, ExportAnnotation[]>();
  for (const row of rows) pages.set(row.page_number, [...(pages.get(row.page_number) ?? []), row]);
  const ordered = [...pages.entries()].sort(([a], [b]) => a - b);
  const notice = 'Chỉ gồm ghi chú và đoạn tô riêng của bạn trên phiên bản này. Không kèm file PDF.';
  if (format === 'text') {
    const out = [
      `Ghi chú: ${clean(source.title)}`,
      `Tác giả: ${clean(source.authors)}`,
      `Phiên bản ${source.versionNo} · Xuất lúc ${stamp(source.exportedAt)}`,
      notice,
    ];
    if (!rows.length) out.push('', 'Chưa có ghi chú hoặc đoạn tô nào.');
    for (const [page, items] of ordered) {
      out.push('', `TRANG ${page}`);
      for (const item of items) {
        if (item.kind === 'TEXT_HIGHLIGHT') {
          out.push(
            `- Đoạn tô (${colorNames[item.color] ?? 'màu khác'}): “${clean(quoteOf(item.anchor))}”`,
          );
          if (item.content.trim())
            out.push(`  Ghi chú: ${clean(item.content).replace(/\n/g, '\n  ')}`);
        } else out.push(`- Ghi chú trang: ${clean(item.content).replace(/\n/g, '\n  ')}`);
      }
    }
    return `${out.join('\n')}\n`;
  }
  const out = [
    `# Ghi chú — ${escapeMarkdown(source.title)}`,
    '',
    `- Tác giả: ${escapeMarkdown(source.authors)}`,
    `- Phiên bản ${source.versionNo} · Xuất lúc ${escapeMarkdown(stamp(source.exportedAt))}`,
    `- ${escapeMarkdown(notice)}`,
  ];
  if (!rows.length) out.push('', escapeMarkdown('Chưa có ghi chú hoặc đoạn tô nào.'));
  for (const [page, items] of ordered) {
    out.push('', `## Trang ${page}`);
    for (const item of items) {
      out.push('');
      if (item.kind === 'TEXT_HIGHLIGHT') {
        out.push(
          `**Đoạn tô ${colorNames[item.color] ?? 'màu khác'}**`,
          '',
          lines(quoteOf(item.anchor), '> '),
        );
        if (item.content.trim()) out.push('', lines(item.content));
      } else out.push('**Ghi chú trang**', '', lines(item.content));
    }
  }
  return `${out.join('\n')}\n`;
}
