import { foldedContains, foldVietnamese } from '../src/materials/search-fold';

describe('Vietnamese search folding', () => {
  it('removes tones, vowel marks, đ and case', () => {
    expect(foldVietnamese('Giáo trình ĐƯỜNG LỐI Kỹ thuật')).toBe('giao trinh duong loi ky thuat');
    expect(foldVietnamese('ư ơ ă â ê ô Ữ Ợ Ặ')).toBe('u o a a e o u o a');
  });
  it('treats user wildcards and backslashes as literal text', () => {
    expect(foldedContains('50%_a\\b')).toBe('%50\\%\\_a\\\\b%');
  });
});
