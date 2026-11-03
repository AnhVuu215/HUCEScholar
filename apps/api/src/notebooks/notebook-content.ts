import { BadRequestException } from '@nestjs/common';

/**
 * CANVAS-01. A notebook page is a vector document: `{ v: 1, items: [...] }`, items in paint order.
 * The API never stores what the browser sent as is: every item is rebuilt field by field from a
 * whitelist, numbers are bounded and rounded, and strings are capped. Text is plain runs that the
 * web app renders as text nodes, so no markup from a page ever reaches the DOM as HTML.
 */
export const PAGE_SIZES = ['A4_PORTRAIT', 'A4_LANDSCAPE', 'INFINITE'] as const;
export const PAPERS = [
  'BLANK',
  'RULED_NARROW',
  'RULED_WIDE',
  'GRID',
  'DOT',
  'CORNELL',
  'O_LI',
  'MUSIC',
] as const;
export const PAPER_COLORS = ['white', 'cream', 'yellow', 'gray', 'dark'] as const;
export const COVERS = [
  'navy',
  'sky',
  'green',
  'mint',
  'orange',
  'red',
  'pink',
  'purple',
  'kraft',
  'charcoal',
] as const;
export const FONTS = [
  'be-vietnam-pro',
  'inter',
  'noto-serif',
  'lora',
  'patrick-hand',
  'dancing-script',
  'roboto-mono',
] as const;
export const PEN_TOOLS = ['ballpoint', 'fountain', 'pencil', 'highlighter'] as const;
export const SHAPES = ['line', 'arrow', 'rect', 'ellipse', 'triangle'] as const;

/** Largest page body the API reads; the database CHECK allows some headroom over it. */
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
export const MAX_ITEMS = 5000;
export const MAX_STROKE_POINTS = 4000;
const MAX_TEXT = 20_000;
const MAX_BLOCKS = 500;
const MAX_RUNS = 2000;
const MAX_SEARCH = 200_000;
const COORD = 100_000;

export type PageSize = (typeof PAGE_SIZES)[number];
export type Paper = (typeof PAPERS)[number];
export type PaperColor = (typeof PAPER_COLORS)[number];
type Run = { t: string; b?: true; i?: true; u?: true; s?: true; c?: string };
type Block = { list: 'ul' | 'ol' | null; runs: Run[] };
export type PageItem =
  | {
      id: string;
      type: 'stroke';
      tool: (typeof PEN_TOOLS)[number];
      color: string;
      width: number;
      points: number[];
    }
  | {
      id: string;
      type: 'text';
      x: number;
      y: number;
      w: number;
      font: (typeof FONTS)[number];
      size: number;
      color: string;
      align: 'left' | 'center' | 'right';
      bg: string | null;
      blocks: Block[];
    }
  | {
      id: string;
      type: 'image';
      assetId: string;
      x: number;
      y: number;
      w: number;
      h: number;
      rot: number;
      crop: { x: number; y: number; w: number; h: number } | null;
    }
  | {
      id: string;
      type: 'shape';
      shape: (typeof SHAPES)[number];
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
      width: number;
      fill: string | null;
      dash: boolean;
    }
  | {
      id: string;
      type: 'sticker';
      sticker: string;
      x: number;
      y: number;
      w: number;
      h: number;
      rot: number;
    }
  | {
      id: string;
      type: 'quote';
      annotationId: string;
      x: number;
      y: number;
      w: number;
      h: number;
    };
export type PageContent = { v: 1; items: PageItem[] };

class ContentError extends Error {}
const fail = (message: string): never => {
  throw new ContentError(message);
};
const record = (value: unknown, what: string): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail(`${what} không hợp lệ.`);
const round = (n: number) => Math.round(n * 100) / 100;
function num(value: unknown, min: number, max: number, what: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    fail(`${what} nằm ngoài giới hạn.`);
  return round(value as number);
}
const coord = (value: unknown, what: string) => num(value, -COORD, COORD, what);
function oneOf<T extends string>(value: unknown, options: readonly T[], what: string): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : fail(`${what} không hợp lệ.`);
}
const HEX = /^#[0-9a-f]{6}$/;
function color(value: unknown, what = 'Màu') {
  return typeof value === 'string' && HEX.test(value.toLowerCase())
    ? value.toLowerCase()
    : fail(`${what} không hợp lệ.`);
}
const optionalColor = (value: unknown, what: string) =>
  value === null || value === undefined ? null : color(value, what);
const ID = /^[1-9]\d{0,18}$/;
const numericId = (value: unknown, what: string) =>
  typeof value === 'string' && ID.test(value) ? value : fail(`${what} không hợp lệ.`);

/** Strips C0 controls except tab/newline, and lone surrogates, so stored text stays printable. */
function cleanText(value: unknown, max: number) {
  if (typeof value !== 'string') fail('Chữ không hợp lệ.');
  const text = (value as string)
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '');
  if (text.length > max) fail('Hộp chữ quá dài.');
  return text;
}

function stroke(item: Record<string, unknown>, id: string): PageItem {
  const points = item.points;
  if (
    !Array.isArray(points) ||
    points.length < 3 ||
    points.length % 3 !== 0 ||
    points.length > MAX_STROKE_POINTS * 3
  )
    fail('Nét vẽ không hợp lệ.');
  const clean = (points as unknown[]).map((p, i) =>
    i % 3 === 2 ? num(p, 0, 1, 'Lực nét') : coord(p, 'Điểm nét'),
  );
  return {
    id,
    type: 'stroke',
    tool: oneOf(item.tool, PEN_TOOLS, 'Loại bút'),
    color: color(item.color),
    width: num(item.width, 0.5, 60, 'Độ dày nét'),
    points: clean,
  };
}

function text(item: Record<string, unknown>, id: string): PageItem {
  if (!Array.isArray(item.blocks) || item.blocks.length < 1 || item.blocks.length > MAX_BLOCKS)
    fail('Hộp chữ không hợp lệ.');
  let length = 0,
    runCount = 0;
  const blocks = (item.blocks as unknown[]).map((raw): Block => {
    const block = record(raw, 'Đoạn chữ');
    const list = block.list === null || block.list === undefined ? null : block.list;
    if (list !== null && list !== 'ul' && list !== 'ol') fail('Kiểu danh sách không hợp lệ.');
    if (!Array.isArray(block.runs) || block.runs.length > MAX_RUNS) fail('Đoạn chữ không hợp lệ.');
    const runs = (block.runs as unknown[]).flatMap((rawRun): Run[] => {
      const run = record(rawRun, 'Chữ');
      const t = cleanText(run.t, MAX_TEXT);
      length += t.length;
      if (!t) return [];
      const out: Run = { t };
      for (const flag of ['b', 'i', 'u', 's'] as const)
        if (run[flag] === true) out[flag] = true;
        else if (run[flag] !== undefined && run[flag] !== false)
          fail('Định dạng chữ không hợp lệ.');
      if (run.c !== undefined && run.c !== null) out.c = color(run.c, 'Màu chữ');
      return [out];
    });
    runCount += runs.length;
    return { list: list as Block['list'], runs };
  });
  if (length > MAX_TEXT || runCount > MAX_RUNS) fail('Hộp chữ quá dài.');
  return {
    id,
    type: 'text',
    x: coord(item.x, 'Vị trí chữ'),
    y: coord(item.y, 'Vị trí chữ'),
    w: num(item.w, 20, 4000, 'Độ rộng hộp chữ'),
    font: oneOf(item.font, FONTS, 'Font chữ'),
    size: num(item.size, 8, 144, 'Cỡ chữ'),
    color: color(item.color, 'Màu chữ'),
    align: oneOf(item.align, ['left', 'center', 'right'] as const, 'Căn lề'),
    bg: optionalColor(item.bg, 'Màu nền hộp chữ'),
    blocks,
  };
}

function box(item: Record<string, unknown>, what: string) {
  return {
    x: coord(item.x, what),
    y: coord(item.y, what),
    w: num(item.w, 1, 20_000, what),
    h: num(item.h, 1, 20_000, what),
  };
}

function image(item: Record<string, unknown>, id: string): PageItem {
  let crop: { x: number; y: number; w: number; h: number } | null = null;
  if (item.crop !== null && item.crop !== undefined) {
    const c = record(item.crop, 'Vùng cắt ảnh');
    crop = {
      x: num(c.x, 0, 1, 'Vùng cắt ảnh'),
      y: num(c.y, 0, 1, 'Vùng cắt ảnh'),
      w: num(c.w, 0.01, 1, 'Vùng cắt ảnh'),
      h: num(c.h, 0.01, 1, 'Vùng cắt ảnh'),
    };
    if (crop.x + crop.w > 1.0001 || crop.y + crop.h > 1.0001) fail('Vùng cắt ảnh không hợp lệ.');
  }
  return {
    id,
    type: 'image',
    assetId: numericId(item.assetId, 'Ảnh'),
    ...box(item, 'Kích thước ảnh'),
    rot: num(item.rot ?? 0, -180, 180, 'Góc xoay'),
    crop,
  };
}

function shape(item: Record<string, unknown>, id: string): PageItem {
  return {
    id,
    type: 'shape',
    shape: oneOf(item.shape, SHAPES, 'Hình'),
    x1: coord(item.x1, 'Điểm hình'),
    y1: coord(item.y1, 'Điểm hình'),
    x2: coord(item.x2, 'Điểm hình'),
    y2: coord(item.y2, 'Điểm hình'),
    color: color(item.color),
    width: num(item.width, 0.5, 40, 'Độ dày nét'),
    fill: optionalColor(item.fill, 'Màu tô'),
    dash: item.dash === true,
  };
}

function sticker(item: Record<string, unknown>, id: string): PageItem {
  const name = item.sticker;
  if (typeof name !== 'string' || !/^[a-z0-9-]{1,32}$/.test(name)) fail('Sticker không hợp lệ.');
  return {
    id,
    type: 'sticker',
    sticker: name as string,
    ...box(item, 'Kích thước sticker'),
    rot: num(item.rot ?? 0, -180, 180, 'Góc xoay'),
  };
}

function quote(item: Record<string, unknown>, id: string): PageItem {
  return {
    id,
    type: 'quote',
    annotationId: numericId(item.annotationId, 'Đoạn trích'),
    x: coord(item.x, 'Vị trí thẻ trích dẫn'),
    y: coord(item.y, 'Vị trí thẻ trích dẫn'),
    w: num(item.w, 120, 4000, 'Kích thước thẻ trích dẫn'),
    h: num(item.h, 40, 8000, 'Kích thước thẻ trích dẫn'),
  };
}

const builders = { stroke, text, image, shape, sticker, quote } as const;

export interface CleanPage {
  content: PageContent;
  searchText: string;
  assetIds: string[];
  annotationIds: string[];
}

/** Validates and rebuilds a page; throws 400 `NOTEBOOK_PAGE_INVALID` with a Vietnamese reason. */
export function cleanPage(raw: unknown): CleanPage {
  try {
    const page = record(raw, 'Trang');
    if (page.v !== 1) fail('Phiên bản dữ liệu trang không được hỗ trợ.');
    if (!Array.isArray(page.items)) fail('Trang không hợp lệ.');
    const items = page.items as unknown[];
    if (items.length > MAX_ITEMS) fail(`Một trang có tối đa ${MAX_ITEMS} đối tượng.`);
    const ids = new Set<string>();
    const assets = new Set<string>(),
      annotations = new Set<string>();
    const text: string[] = [];
    const clean = items.map((rawItem) => {
      const item = record(rawItem, 'Đối tượng');
      const id = item.id;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(id) || ids.has(id))
        fail('Mã đối tượng không hợp lệ.');
      ids.add(id as string);
      const type = item.type;
      if (typeof type !== 'string' || !Object.hasOwn(builders, type))
        fail('Loại đối tượng không hợp lệ.');
      const built = builders[type as keyof typeof builders](item, id as string);
      if (built.type === 'image') assets.add(built.assetId);
      if (built.type === 'quote') annotations.add(built.annotationId);
      if (built.type === 'text')
        text.push(built.blocks.map((b) => b.runs.map((r) => r.t).join('')).join('\n'));
      return built;
    });
    return {
      content: { v: 1, items: clean },
      searchText: text.join('\n').slice(0, MAX_SEARCH),
      assetIds: [...assets],
      annotationIds: [...annotations],
    };
  } catch (error) {
    if (error instanceof ContentError)
      throw new BadRequestException({ code: 'NOTEBOOK_PAGE_INVALID', message: error.message });
    throw error;
  }
}

/** Assets a stored page places; used when duplicating and by the orphan sweep tests. */
export function pageAssetIds(content: unknown): string[] {
  const items = (content as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) =>
    item && typeof item === 'object' && (item as { type?: unknown }).type === 'image'
      ? [String((item as { assetId?: unknown }).assetId)]
      : [],
  );
}
