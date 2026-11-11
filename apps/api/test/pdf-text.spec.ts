import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractPdfText, MAX_PAGE_CHARS, pagesFromText } from '../src/files/pdf-text';
import { foldedTerms, foldVietnamese, matchSnippet } from '../src/library/search-fold';

describe('PDF page text', () => {
  it('numbers pages by form feed and keeps the place of empty ones', () => {
    expect(pagesFromText('một\n\fhai\f\f bốn \f')).toEqual([
      { pageNumber: 1, content: 'một' },
      { pageNumber: 2, content: 'hai' },
      { pageNumber: 4, content: 'bốn' },
    ]);
  });
  it('joins lines, drops NUL and control characters, and composes accents', () => {
    expect(pagesFromText('Bê tông\ncốt\u0000  thép\u0007')).toEqual([
      { pageNumber: 1, content: 'Bê tông cốt thép' },
    ]);
  });
  it('bounds one very long page', () => {
    expect(pagesFromText('a'.repeat(MAX_PAGE_CHARS + 5))[0].content).toHaveLength(MAX_PAGE_CHARS);
  });

  describe('extraction', () => {
    let directory: string;
    beforeEach(async () => {
      directory = await mkdtemp(join(tmpdir(), 'hs-text-'));
    });
    afterEach(() => rm(directory, { recursive: true, force: true }));
    // A stand-in for pdftotext: the same process handling without needing Poppler here.
    async function tool(script: string) {
      const path = join(directory, 'tool.cmd.js');
      await writeFile(path, `#!/usr/bin/env node\n${script}`);
      await chmod(path, 0o755);
      return path;
    }
    const posix = process.platform === 'win32' ? it.skip : it;

    posix('keeps only whole pages when the limit cuts the output', async () => {
      const binary = await tool("process.stdout.write('one\\ftwo\\fthree-is-long-enough');");
      await expect(extractPdfText(binary, 'x.pdf', 10)).resolves.toEqual({
        text: 'one\ftwo\f',
        truncated: true,
      });
    });
    posix('fails on a non-zero exit so the sweep can retry', async () => {
      const binary = await tool('process.exit(3);');
      await expect(extractPdfText(binary, 'x.pdf')).rejects.toMatchObject({ retryable: true });
    });
    it('fails when the tool cannot start', async () => {
      await expect(extractPdfText(join(directory, 'missing'), 'x.pdf')).rejects.toMatchObject({
        retryable: true,
      });
    });
  });
});

describe('match snippet', () => {
  const page =
    `${'mở đầu '.repeat(30)}Bê tông cốt thép chịu nén tốt ${'phần sau '.repeat(30)}`.trim();

  it('marks the original accented text found by an unaccented query', () => {
    const snippet = matchSnippet(page, 'be tong cot thep');
    expect(snippet.match).toBe('Bê tông cốt thép');
    expect(snippet.before.startsWith('…')).toBe(true);
    expect(snippet.after.endsWith('…')).toBe(true);
    expect(snippet.before.length).toBeLessThan(90);
    expect(snippet.after.length).toBeLessThan(90);
  });
  it('falls back to the first word found when the words are apart', () => {
    expect(matchSnippet('thép rồi mới đến bê tông', 'be tong thep').match).toBe('bê');
  });
  it('has no ellipsis on a short page', () => {
    expect(matchSnippet('cốt thép', 'cot')).toEqual({ before: '', match: 'cốt', after: ' thép' });
  });
  it('starts the page when nothing can be located', () => {
    expect(matchSnippet('nội dung', 'khác')).toEqual({ before: '', match: '', after: 'nội dung' });
  });
  it('keeps positions right after decomposed text and đ', () => {
    const text = 'Đề ba đường';
    expect(foldVietnamese(text)).toBe('de ba duong');
    expect(matchSnippet(text, 'duong').match).toBe('đường');
  });
  it('treats search wildcards literally in terms', () => {
    expect(foldedTerms('100%')).toEqual(['%100\\%%']);
  });
});
