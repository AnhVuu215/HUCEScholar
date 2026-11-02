import { BadRequestException } from '@nestjs/common';
import { cleanPage, MAX_ITEMS, pageAssetIds } from '../src/notebooks/notebook-content';
import { quoteHeight } from '../src/notebooks/notebooks.service';

const stroke = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  type: 'stroke',
  tool: 'fountain',
  color: '#1D4ED8',
  width: 2,
  points: [10, 10, 0.5, 20.123456, 30, 0.7],
  ...over,
});
const text = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  type: 'text',
  x: 40,
  y: 60,
  w: 300,
  font: 'patrick-hand',
  size: 18,
  color: '#172b45',
  align: 'left',
  bg: null,
  blocks: [
    {
      list: null,
      runs: [
        { t: 'Định luật ', b: true },
        { t: 'Ôm', i: true, c: '#ff0000' },
      ],
    },
    { list: 'ul', runs: [{ t: 'Điện áp' }] },
  ],
  ...over,
});
function reason(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as { code: string; message: string };
  }
  throw new Error('Expected a rejection.');
}

describe('CANVAS-01 page content', () => {
  it('rebuilds every item type from a whitelist and rounds numbers', () => {
    const page = cleanPage({
      v: 1,
      extra: 'dropped',
      items: [
        { ...stroke(), onclick: 'alert(1)' },
        text(),
        {
          id: 'i1',
          type: 'image',
          assetId: '12',
          x: 1,
          y: 2,
          w: 300,
          h: 200,
          rot: 15,
          crop: { x: 0.1, y: 0, w: 0.8, h: 1 },
        },
        {
          id: 'h1',
          type: 'shape',
          shape: 'arrow',
          x1: 0,
          y1: 0,
          x2: 100,
          y2: 50,
          color: '#000000',
          width: 2,
          fill: null,
          dash: true,
        },
        { id: 'k1', type: 'sticker', sticker: 'washi-blue', x: 0, y: 0, w: 120, h: 30, rot: -10 },
        { id: 'q1', type: 'quote', annotationId: '99', x: 56, y: 56, w: 682, h: 140 },
      ],
    });
    expect(page.content.items).toHaveLength(6);
    expect(page.content).not.toHaveProperty('extra');
    expect(page.content.items[0]).toEqual({
      id: 's1',
      type: 'stroke',
      tool: 'fountain',
      color: '#1d4ed8',
      width: 2,
      points: [10, 10, 0.5, 20.12, 30, 0.7],
    });
    expect(page.assetIds).toEqual(['12']);
    expect(page.annotationIds).toEqual(['99']);
    expect(page.searchText).toBe('Định luật Ôm\nĐiện áp');
    expect(pageAssetIds(page.content)).toEqual(['12']);
  });

  it('keeps text as plain runs and strips control characters', () => {
    const page = cleanPage({
      v: 1,
      items: [
        text({
          blocks: [{ list: null, runs: [{ t: 'a\u0000b<script>\u0007', u: true }, { t: '' }] }],
        }),
      ],
    });
    const item = page.content.items[0];
    expect(item.type === 'text' && item.blocks[0].runs).toEqual([{ t: 'ab<script>', u: true }]);
  });

  it.each([
    ['unknown type', { id: 'x', type: 'html', html: '<b>' }],
    ['bad color', stroke({ color: 'red' })],
    ['NaN coordinate', stroke({ points: [Number.NaN, 0, 0.5] })],
    ['points not in threes', stroke({ points: [1, 2] })],
    ['pressure above 1', stroke({ points: [1, 2, 1.5] })],
    ['huge coordinate', stroke({ points: [1e9, 2, 0.5] })],
    ['unknown font', text({ font: 'Comic Sans' })],
    ['bad list', text({ blocks: [{ list: 'dl', runs: [] }] })],
    ['bad flag', text({ blocks: [{ list: null, runs: [{ t: 'a', b: 'yes' }] }] })],
    [
      'non-numeric asset',
      { id: 'i', type: 'image', assetId: '../x', x: 0, y: 0, w: 1, h: 1, rot: 0, crop: null },
    ],
    [
      'crop out of bounds',
      {
        id: 'i',
        type: 'image',
        assetId: '1',
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        rot: 0,
        crop: { x: 0.5, y: 0, w: 0.8, h: 1 },
      },
    ],
    ['sticker path', { id: 'k', type: 'sticker', sticker: '../a', x: 0, y: 0, w: 1, h: 1 }],
    ['bad id', stroke({ id: 'a b' })],
  ])('rejects %s', (_label, item) => {
    expect(reason(() => cleanPage({ v: 1, items: [item] })).code).toBe('NOTEBOOK_PAGE_INVALID');
  });

  it('rejects duplicate ids, wrong versions and too many items', () => {
    expect(reason(() => cleanPage({ v: 1, items: [stroke(), stroke()] })).message).toMatch(/Mã/);
    expect(reason(() => cleanPage({ v: 2, items: [] })).message).toMatch(/Phiên bản/);
    expect(reason(() => cleanPage([])).code).toBe('NOTEBOOK_PAGE_INVALID');
    const many = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => stroke({ id: `s${i}` }));
    expect(reason(() => cleanPage({ v: 1, items: many })).message).toMatch(/tối đa/);
  });

  it('caps a text box at 20 000 characters', () => {
    const long = text({ blocks: [{ list: null, runs: [{ t: 'a'.repeat(20_001) }] }] });
    expect(reason(() => cleanPage({ v: 1, items: [long] })).message).toMatch(/quá dài/);
  });

  it('sizes quote cards to their text within bounds', () => {
    const view = {
      available: true as const,
      kind: 'TEXT_HIGHLIGHT',
      quote: 'x'.repeat(400),
      note: '',
      color: '#fff59d',
      versionId: '1',
      pageNumber: 2,
      title: 'Giáo trình',
    };
    expect(quoteHeight(view, 682)).toBeGreaterThan(120);
    expect(quoteHeight({ ...view, quote: 'x'.repeat(100_000) }, 682)).toBe(640);
    expect(quoteHeight({ available: false }, 682)).toBe(120);
  });
});
