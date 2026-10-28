import {
  escapeMarkdown,
  exportAnnotations,
  exportNotebook,
} from '../src/materials/annotation-export';

const source = {
  title: 'Giáo trình # [Cơ học](javascript:x)',
  authors: 'Nhóm tác giả <b>A</b>',
  versionNo: 3,
  exportedAt: new Date('2026-10-21T08:00:00Z'),
};
const rows = [
  {
    page_number: 4,
    kind: 'PAGE_NOTE',
    content: 'Ôn lại\n- mục 2\n1. định luật',
    anchor: null,
    color: '#FFF59D',
  },
  {
    page_number: 2,
    kind: 'TEXT_HIGHLIGHT',
    content: '',
    anchor: { quote: 'Lực bằng khối lượng nhân gia tốc', quads: [] },
    color: '#90CAF9',
  },
  {
    page_number: 2,
    kind: 'TEXT_HIGHLIGHT',
    content: 'Xem ![ảnh](https://example.test/x.png) và www.example.test',
    anchor: { quote: '<script>alert(1)</script>', quads: [] },
    color: '#FFF59D',
  },
];

describe('annotation export', () => {
  it('escapes Markdown syntax so notes never become links, images, HTML or blocks', () => {
    expect(escapeMarkdown('[a](b) ![c](d) <i>x</i> `y` *z* # h')).toBe(
      '\\[a\\]\\(b\\) \\!\\[c\\]\\(d\\) \\<i\\>x\\</i\\> \\`y\\` \\*z\\* \\# h',
    );
    expect(escapeMarkdown('- item\n+ item\n12. item\n=== ')).toBe(
      '\\- item\n\\+ item\n12\\. item\n\\=== ',
    );
    expect(escapeMarkdown('https://a.test www.b.test')).toBe('https\\://a.test www\\.b.test');
    expect(escapeMarkdown('a\u0007b\r\nc')).toBe('ab\nc');
    // Ordinary punctuation stays readable.
    expect(escapeMarkdown('Trang 3, mục 2.1: xong.')).toBe('Trang 3, mục 2.1: xong.');
  });
  it('groups by page in order and keeps quotes in blockquotes with hard line breaks', () => {
    const md = exportAnnotations(source, rows, 'markdown');
    expect(md.startsWith('# Ghi chú — Giáo trình \\# \\[Cơ học\\]\\(javascript:x\\)\n')).toBe(true);
    expect(md).toContain('- Tác giả: Nhóm tác giả \\<b\\>A\\</b\\>');
    expect(md).toContain('- Phiên bản 3 · Xuất lúc');
    expect(md.indexOf('## Trang 2')).toBeLessThan(md.indexOf('## Trang 4'));
    expect(md).toContain('**Đoạn tô xanh dương**\n\n> Lực bằng khối lượng nhân gia tốc');
    expect(md).toContain('> \\<script\\>alert\\(1\\)\\</script\\>');
    expect(md).toContain(
      'Xem \\!\\[ảnh\\]\\(https\\://example.test/x.png\\) và www\\.example.test',
    );
    expect(md).toContain('**Ghi chú trang**\n\nÔn lại\\\n\\- mục 2\\\n1\\. định luật');
    expect(md).not.toMatch(/<script>|\]\(https:/);
  });
  it('writes plain text without escapes and says when there is nothing yet', () => {
    const text = exportAnnotations(source, rows, 'text');
    expect(text).toContain('Ghi chú: Giáo trình # [Cơ học](javascript:x)');
    expect(text).toContain('TRANG 2\n- Đoạn tô (xanh dương): “Lực bằng khối lượng nhân gia tốc”');
    expect(text).toContain('TRANG 4\n- Ghi chú trang: Ôn lại\n  - mục 2\n  1. định luật');
    expect(exportAnnotations(source, [], 'text')).toContain('Chưa có ghi chú hoặc đoạn tô nào.');
    expect(exportAnnotations(source, [], 'markdown')).toContain(
      'Chưa có ghi chú hoặc đoạn tô nào.',
    );
  });
  it('EXPORT-02: writes one section per document in the given order with the filters', () => {
    const documents = [
      { ...source, rows },
      { title: 'Bài tập', authors: 'B', versionNo: 1, rows: [rows[0]] },
    ];
    const meta = { filters: 'có chữ “[x](y)”', exportedAt: source.exportedAt };
    const md = exportNotebook(documents, meta, 'markdown');
    expect(md.startsWith('# Sổ tay ghi chú\n')).toBe(true);
    expect(md).toContain('- Bộ lọc: có chữ “\\[x\\]\\(y\\)”');
    expect(md).toContain('## Giáo trình \\# \\[Cơ học\\]\\(javascript:x\\) · phiên bản 3');
    expect(md.indexOf('### Trang 2')).toBeLessThan(md.indexOf('### Trang 4'));
    expect(md.indexOf('· phiên bản 3')).toBeLessThan(md.indexOf('## Bài tập · phiên bản 1'));
    expect(md).not.toMatch(/<script>|\]\(https:/);
    const text = exportNotebook(documents, meta, 'text');
    expect(text).toContain('Bộ lọc: có chữ “[x](y)”');
    expect(text).toContain('=== Bài tập · Phiên bản 1 ===\nTác giả: B\n\nTRANG 4\n- Ghi chú trang');
    expect(exportNotebook([], meta, 'text')).toContain('Chưa có ghi chú hoặc đoạn tô nào.');
  });
});
