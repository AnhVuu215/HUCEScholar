import { textIndexState } from '../src/files/text-index-state';

const safe = { scan_status: 'SAFE', has_text_layer: true, copy_restricted: false, file_text: null };

describe('textIndexState (SEARCH-04)', () => {
  it('only reports an index for safe PDFs with copyable text', () => {
    expect(textIndexState(null)).toEqual({ state: 'UNAVAILABLE' });
    expect(textIndexState({ ...safe, scan_status: 'CHECKING' })).toEqual({ state: 'UNAVAILABLE' });
    expect(textIndexState({ ...safe, copy_restricted: true })).toEqual({
      state: 'COPY_RESTRICTED',
    });
    expect(textIndexState({ ...safe, has_text_layer: false })).toEqual({ state: 'NO_TEXT' });
    expect(textIndexState({ ...safe, has_text_layer: null })).toEqual({ state: 'NO_TEXT' });
  });
  it('follows the worker: pending until three failures, then failed', () => {
    const text = (attempts: number, indexed_at: Date | null = null) => ({
      ...safe,
      file_text: { pages: 4, truncated: true, attempts, indexed_at },
    });
    expect(textIndexState(safe)).toEqual({ state: 'PENDING', attempts: 0 });
    expect(textIndexState(text(2))).toEqual({ state: 'PENDING', attempts: 2 });
    expect(textIndexState(text(3))).toEqual({ state: 'FAILED', attempts: 3 });
    expect(textIndexState(text(3, new Date('2026-11-13T00:00:00Z')))).toEqual({
      state: 'INDEXED',
      pages: 4,
      truncated: true,
      indexedAt: '2026-11-13T00:00:00.000Z',
    });
  });
});
