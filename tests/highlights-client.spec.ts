import { expect, test } from './helpers/test';
import { readHighlights } from '../apps/web/lib/highlights';

const item = {
  id: '23',
  versionId: '45',
  pageNumber: 1,
  kind: 'TEXT_HIGHLIGHT',
  content: 'Nội dung riêng',
  color: '#123abc',
  revision: 2,
  updatedAt: '2026-10-17T00:00:00.000Z',
  anchor: {
    coordinateSpace: 'normalized-pdf-v1',
    quote: 'Đoạn văn gốc',
    quads: [[0.1, 0.8, 0.6, 0.8, 0.6, 0.75, 0.1, 0.75]],
  },
};

test('a valid saved future color does not hide the other annotations', async () => {
  const fetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ items: [item, { ...item, id: '24', color: '#FFF59D' }], nextCursor: null });
  try {
    const items = await readHighlights('45', 1, new AbortController().signal);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: '23', color: '#123abc', content: 'Nội dung riêng' });
  } finally {
    globalThis.fetch = fetch;
  }
});

for (const color of ['red', '#FFF', 'url(https://example.test)', null, { hex: '#FFF59D' }]) {
  test(`malformed saved color ${JSON.stringify(color)} is rejected`, async () => {
    const fetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ items: [{ ...item, color }], nextCursor: null });
    try {
      await expect(readHighlights('45', 1, new AbortController().signal)).rejects.toThrow(
        'Invalid highlights response',
      );
    } finally {
      globalThis.fetch = fetch;
    }
  });
}
