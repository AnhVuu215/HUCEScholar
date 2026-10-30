import {
  foldedPhrase,
  foldedTerms,
  foldVietnamese,
  MAX_SEARCH_TERMS,
} from '../src/materials/search-fold';

describe('Vietnamese search folding', () => {
  it('removes tones, vowel marks, đ and case', () => {
    expect(foldVietnamese('Giáo trình ĐƯỜNG LỐI Kỹ thuật')).toBe('giao trinh duong loi ky thuat');
    expect(foldVietnamese('ư ơ ă â ê ô Ữ Ợ Ặ')).toBe('u o a a e o u o a');
  });
  it('treats user wildcards and backslashes as literal text', () => {
    expect(foldedTerms('50%_a\\b')).toEqual(['%50\\%\\_a\\\\b%']);
  });
  it('splits on any whitespace and drops repeated words', () => {
    expect(foldedTerms('  Giáo\ttrình  GIAO trình\nđường ')).toEqual([
      '%giao%',
      '%trinh%',
      '%duong%',
    ]);
    expect(foldedTerms('   ')).toEqual([]);
  });
  it('keeps at most the first MAX_SEARCH_TERMS distinct words', () => {
    const words = Array.from({ length: MAX_SEARCH_TERMS + 3 }, (_, i) => `w${i}`);
    expect(foldedTerms(words.join(' '))).toEqual(
      words.slice(0, MAX_SEARCH_TERMS).map((w) => `%${w}%`),
    );
  });
  it('builds one ordered phrase pattern for ranking', () => {
    expect(foldedPhrase('  Kinh\tTẾ  vĩ mô ')).toBe('%kinh te vi mo%');
    expect(foldedPhrase('50% a_b')).toBe('%50\\% a\\_b%');
  });
});
