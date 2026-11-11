import { clean, escapeMarkdown, type ExportFormat } from './annotation-export';
import { MAX_REVIEW_BOX } from './study-schedule';

/** STUDY-04: an export holds at most this many cards; narrow the filter for the rest. */
export const MAX_EXPORT_CARDS = 5000;

export type ExportCard = {
  question: string;
  answer: string;
  quote: string;
  pageNumber: number;
  reviewBox: number;
  dueOn: string;
};
export type ExportCardDocument = {
  title: string;
  authors: string;
  versionNo: number;
  cards: ExportCard[];
};

const stamp = (date: Date) => date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const day = (value: string) => value.split('-').reverse().join('/');
const box = (card: ExportCard) =>
  card.reviewBox === 0 ? 'thẻ mới' : `hộp ${card.reviewBox}/${MAX_REVIEW_BOX}`;
/** A CommonMark hard break keeps the owner's own line breaks inside one paragraph. */
const lines = (value: string, prefix = '') =>
  escapeMarkdown(value)
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\\\n');
const indented = (value: string) => clean(value).replace(/\n/g, '\n   ');

/**
 * The owner's study cards grouped by document: question, answer, the highlighted source and
 * where it is in the review schedule. `filters` says in words which cards the file holds.
 */
export function exportStudyCards(
  documents: ExportCardDocument[],
  meta: { filters: string; exportedAt: Date },
  format: ExportFormat,
) {
  const notice =
    'Chỉ gồm thẻ ôn tập riêng của bạn trên các tài liệu còn mở được. Không kèm file PDF.';
  const empty = 'Chưa có thẻ ôn tập nào trong bộ lọc này.';
  const total = documents.reduce((sum, doc) => sum + doc.cards.length, 0);
  if (format === 'text') {
    const out = [
      'THẺ ÔN TẬP',
      `Xuất lúc ${stamp(meta.exportedAt)} · ${total} thẻ`,
      `Bộ lọc: ${clean(meta.filters)}`,
      notice,
    ];
    if (!total) out.push('', empty);
    for (const doc of documents) {
      out.push(
        '',
        `=== ${clean(doc.title)} · Phiên bản ${doc.versionNo} ===`,
        `Tác giả: ${clean(doc.authors)}`,
      );
      doc.cards.forEach((card, index) => {
        out.push(
          '',
          `${index + 1}. Hỏi: ${indented(card.question)}`,
          `   Đáp: ${indented(card.answer)}`,
          `   Đoạn tô (trang ${card.pageNumber}): “${indented(card.quote)}”`,
          `   Lịch ôn: ${box(card)}, đến hạn ${day(card.dueOn)}`,
        );
      });
    }
    return `${out.join('\n')}\n`;
  }
  const out = [
    '# Thẻ ôn tập',
    '',
    `- Xuất lúc ${escapeMarkdown(stamp(meta.exportedAt))} · ${total} thẻ`,
    `- Bộ lọc: ${escapeMarkdown(meta.filters)}`,
    `- ${escapeMarkdown(notice)}`,
  ];
  if (!total) out.push('', escapeMarkdown(empty));
  for (const doc of documents) {
    out.push(
      '',
      `## ${escapeMarkdown(doc.title)} · phiên bản ${doc.versionNo}`,
      '',
      `- Tác giả: ${escapeMarkdown(doc.authors)}`,
    );
    doc.cards.forEach((card, index) => {
      out.push(
        '',
        `### Thẻ ${index + 1}`,
        '',
        `**Hỏi:** ${lines(card.question)}`,
        '',
        `**Đáp:** ${lines(card.answer)}`,
        '',
        lines(card.quote, '> '),
        '',
        `*Trang ${card.pageNumber} · ${box(card)} · đến hạn ${escapeMarkdown(day(card.dueOn))}*`,
      );
    });
  }
  return `${out.join('\n')}\n`;
}
