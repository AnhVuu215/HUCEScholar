import { expect, test } from './helpers/test';
import {
  findPageText,
  searchPdfText,
  resolveOutlinePage,
  type PdfFindSource,
} from '../apps/web/lib/pdf-find';

test('PDF find preserves original offsets, Vietnamese case and literal punctuation', () => {
  const parts = ['Ôn T', 'ẬP tiếng Việt ', '[x] %_\\ Ôn tập ', 'cuối'];
  const text = parts.join('');
  const matches = findPageText(parts, 'ôn tập', 2);
  expect(matches).toHaveLength(2);
  expect(matches.map((match) => text.slice(match.start, match.end))).toEqual(['Ôn TẬP', 'Ôn tập']);
  expect(matches.every((match) => match.pageNumber === 2)).toBe(true);
  expect(findPageText(parts, '[x] %_\\', 1)).toHaveLength(1);
  expect(findPageText(parts, 'on tap', 1)).toEqual([]);
  expect(findPageText(parts, '  ', 1)).toEqual([]);
  expect(() => findPageText(parts, 'x'.repeat(101), 1)).toThrow();
  expect(findPageText([{ str: 'Ôn', hasEOL: true }, { str: 'tập' }], 'ôn tập', 1)).toHaveLength(1);
});
test('PDF search publishes batches, bounds result memory and stops before the next page on abort', async () => {
  const seen: number[] = [];
  const pdf: PdfFindSource = {
    numPages: 8,
    getPage: async (page) => {
      seen.push(page);
      return {
        getTextContent: async () => ({
          items: [{ str: 'ôn tập ôn tập' }, { type: 'beginMarkedContent' }],
        }),
      };
    },
  };
  const controller = new AbortController();
  const batches: number[] = [];
  await expect(
    searchPdfText(
      pdf,
      'ôn tập',
      controller.signal,
      (result) => {
        batches.push(result.scanned);
        controller.abort();
      },
      async () => {},
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(seen.length).toBeLessThan(8);
  expect(batches).toHaveLength(1);
  const many: PdfFindSource = {
    numPages: 2,
    getPage: async () => ({
      getTextContent: async () => ({ items: [{ str: 'x '.repeat(2500) }] }),
    }),
  };
  const result = await searchPdfText(
    many,
    'x',
    new AbortController().signal,
    () => {},
    async () => {},
  );
  expect(result.matches).toHaveLength(2000);
  expect(result.truncated).toBe(true);
});
test('outline resolves only bounded internal destinations and surfaces named-destination failures', async () => {
  const pdf = {
    numPages: 4,
    getDestination: async (name: string) => {
      if (name === 'broken') throw new Error('broken');
      return name === 'chapter' ? [{ num: 8, gen: 0 }, { name: 'Fit' }] : null;
    },
    getPageIndex: async () => 2,
  };
  expect(await resolveOutlinePage(pdf, 'chapter')).toBe(3);
  expect(await resolveOutlinePage(pdf, [0, { name: 'Fit' }])).toBe(1);
  expect(await resolveOutlinePage(pdf, [99, { name: 'Fit' }])).toBeNull();
  expect(await resolveOutlinePage(pdf, 'https://example.test')).toBeNull();
  expect(await resolveOutlinePage(pdf, [{ num: -1, gen: 0 }])).toBeNull();
  await expect(resolveOutlinePage(pdf, 'broken')).rejects.toThrow('broken');
});
