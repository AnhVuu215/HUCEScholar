/**
 * CANVAS-01 "Vở ghi": the page model shared by the editor, thumbnails, the print view and PNG
 * export. Pure functions only (no DOM), so geometry, erasing and shape recognition are testable.
 * The API rebuilds every item from the same whitelist (apps/api/src/notebooks/notebook-content.ts).
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
export type PageSize = (typeof PAGE_SIZES)[number];
export type Paper = (typeof PAPERS)[number];
export type PaperColor = (typeof PAPER_COLORS)[number];
export type Cover = (typeof COVERS)[number];

/** CSS pixels at 96 dpi; A4 is 210 × 297 mm. */
export const PAGE_BOX: Record<Exclude<PageSize, 'INFINITE'>, { w: number; h: number }> = {
  A4_PORTRAIT: { w: 794, h: 1123 },
  A4_LANDSCAPE: { w: 1123, h: 794 },
};
export const pageBox = (size: PageSize) => (size === 'INFINITE' ? null : PAGE_BOX[size]);

export const SIZE_LABELS: Record<PageSize, string> = {
  A4_PORTRAIT: 'A4 dọc',
  A4_LANDSCAPE: 'A4 ngang',
  INFINITE: 'Trang vô hạn',
};
export const PAPER_LABELS: Record<Paper, string> = {
  BLANK: 'Trắng trơn',
  RULED_NARROW: 'Kẻ ngang dòng hẹp',
  RULED_WIDE: 'Kẻ ngang dòng rộng',
  GRID: 'Ô vuông 5 mm',
  DOT: 'Lưới chấm',
  CORNELL: 'Cornell',
  O_LI: 'Vở ô li (4 ô)',
  MUSIC: 'Khuông nhạc',
};
export const PAPER_COLOR_LABELS: Record<PaperColor, string> = {
  white: 'Trắng',
  cream: 'Kem',
  yellow: 'Vàng nhạt',
  gray: 'Xám',
  dark: 'Giấy tối',
};
/** Paper fill and its two line inks; dark paper uses light lines. */
export const PAPER_INK: Record<PaperColor, { fill: string; line: string; strong: string }> = {
  white: { fill: '#ffffff', line: '#c9d6e6', strong: '#e2a2a2' },
  cream: { fill: '#fbf6e8', line: '#d7cfb8', strong: '#dda08f' },
  yellow: { fill: '#fff8cc', line: '#d9cf96', strong: '#d99a7e' },
  gray: { fill: '#eef1f5', line: '#c3ccd8', strong: '#d9a3a3' },
  dark: { fill: '#1f2733', line: '#3e4b5e', strong: '#7a4d55' },
};
export const COVER_STYLES: Record<Cover, { label: string; fill: string; ink: string }> = {
  navy: { label: 'Xanh đậm', fill: '#0b2a55', ink: '#ffffff' },
  sky: { label: 'Xanh trời', fill: '#3b82c4', ink: '#ffffff' },
  green: { label: 'Xanh lá', fill: '#2f6b4f', ink: '#ffffff' },
  mint: { label: 'Bạc hà', fill: '#a8dcc8', ink: '#123a2c' },
  orange: { label: 'Cam', fill: '#d9792b', ink: '#ffffff' },
  red: { label: 'Đỏ', fill: '#a33a3a', ink: '#ffffff' },
  pink: { label: 'Hồng', fill: '#e9a6bd', ink: '#4a1d2c' },
  purple: { label: 'Tím', fill: '#5b3f8c', ink: '#ffffff' },
  kraft: { label: 'Giấy kraft', fill: '#c49a6c', ink: '#3b2a17' },
  charcoal: { label: 'Than chì', fill: '#33373d', ink: '#ffffff' },
};

export const FONTS = [
  { id: 'be-vietnam-pro', label: 'Be Vietnam Pro', family: "'Notes Be Vietnam Pro', sans-serif" },
  { id: 'inter', label: 'Inter', family: "'Notes Inter', sans-serif" },
  { id: 'noto-serif', label: 'Noto Serif', family: "'Notes Noto Serif', serif" },
  { id: 'lora', label: 'Lora', family: "'Notes Lora', serif" },
  { id: 'patrick-hand', label: 'Patrick Hand (viết tay)', family: "'Notes Patrick Hand', cursive" },
  {
    id: 'dancing-script',
    label: 'Dancing Script (viết tay)',
    family: "'Notes Dancing Script', cursive",
  },
  { id: 'roboto-mono', label: 'Roboto Mono (đơn cách)', family: "'Notes Roboto Mono', monospace" },
] as const;
export type FontId = (typeof FONTS)[number]['id'];
export const fontFamily = (id: string) => FONTS.find((f) => f.id === id)?.family ?? FONTS[0].family;

export const PEN_TOOLS = ['ballpoint', 'fountain', 'pencil', 'highlighter'] as const;
export type PenTool = (typeof PEN_TOOLS)[number];
export const SHAPES = ['line', 'arrow', 'rect', 'ellipse', 'triangle'] as const;
export type ShapeKind = (typeof SHAPES)[number];
export const SHAPE_LABELS: Record<ShapeKind, string> = {
  line: 'Đường thẳng',
  arrow: 'Mũi tên',
  rect: 'Hình chữ nhật',
  ellipse: 'Hình elip',
  triangle: 'Tam giác',
};
/** Ink colors offered first; any other #rrggbb can be picked and is remembered. */
export const INK_COLORS = [
  '#172b45',
  '#1d4ed8',
  '#c62828',
  '#2e7d32',
  '#6a1b9a',
  '#ef6c00',
  '#00838f',
  '#6d4c41',
] as const;
export const HIGHLIGHTER_COLORS = [
  '#fff176',
  '#a5d6a7',
  '#90caf9',
  '#f8bbd0',
  '#ffcc80',
  '#ce93d8',
] as const;

export type Run = { t: string; b?: true; i?: true; u?: true; s?: true; c?: string };
export type Block = { list: 'ul' | 'ol' | null; runs: Run[] };
export type StrokeItem = {
  id: string;
  type: 'stroke';
  tool: PenTool;
  color: string;
  width: number;
  /** Flat [x, y, pressure, x, y, pressure, …]. */
  points: number[];
};
export type TextItem = {
  id: string;
  type: 'text';
  x: number;
  y: number;
  w: number;
  font: FontId;
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  bg: string | null;
  blocks: Block[];
};
export type Crop = { x: number; y: number; w: number; h: number };
export type ImageItem = {
  id: string;
  type: 'image';
  assetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  crop: Crop | null;
};
export type ShapeItem = {
  id: string;
  type: 'shape';
  shape: ShapeKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  fill: string | null;
  dash: boolean;
};
export type StickerItem = {
  id: string;
  type: 'sticker';
  sticker: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
};
export type QuoteItem = {
  id: string;
  type: 'quote';
  annotationId: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
export type PageItem = StrokeItem | TextItem | ImageItem | ShapeItem | StickerItem | QuoteItem;
export type PageContent = { v: 1; items: PageItem[] };

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export const MAX_ITEMS = 5000;
export const MAX_STROKE_POINTS = 4000;
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;

export function newId(prefix = 'n') {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return (
    prefix +
    Array.from(bytes, (b) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 16)
  );
}
export const round = (n: number) => Math.round(n * 100) / 100;

// ---- Geometry ---------------------------------------------------------------------------------

export function strokePoints(item: StrokeItem): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 2 < item.points.length; i += 3)
    out.push({ x: item.points[i], y: item.points[i + 1] });
  return out;
}
/** Rough height of a text box before the browser has measured it. */
export function estimateTextHeight(item: TextItem) {
  const perLine = Math.max(4, Math.floor(item.w / (item.size * 0.55)));
  const lines = item.blocks.reduce((sum, block) => {
    const length = block.runs.reduce((n, r) => n + r.t.length, 0);
    return sum + Math.max(1, Math.ceil(length / perLine));
  }, 0);
  return Math.max(item.size * 1.5, lines * item.size * 1.5) + 8;
}
function rotatedBox(x: number, y: number, w: number, h: number, rot: number): Rect {
  if (!rot) return { x, y, w, h };
  const cx = x + w / 2,
    cy = y + h / 2,
    a = (rot * Math.PI) / 180;
  const cos = Math.abs(Math.cos(a)),
    sin = Math.abs(Math.sin(a));
  const bw = w * cos + h * sin,
    bh = w * sin + h * cos;
  return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
}
export function itemBounds(item: PageItem, textHeight?: number): Rect {
  switch (item.type) {
    case 'stroke': {
      const pts = strokePoints(item);
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const pad = item.width / 2;
      return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    }
    case 'text':
      return { x: item.x, y: item.y, w: item.w, h: textHeight ?? estimateTextHeight(item) };
    case 'shape': {
      const pad = item.width / 2;
      const x = Math.min(item.x1, item.x2),
        y = Math.min(item.y1, item.y2);
      return {
        x: x - pad,
        y: y - pad,
        w: Math.abs(item.x2 - item.x1) + pad * 2,
        h: Math.abs(item.y2 - item.y1) + pad * 2,
      };
    }
    case 'image':
    case 'sticker':
      return rotatedBox(item.x, item.y, item.w, item.h, item.rot);
    case 'quote':
      return { x: item.x, y: item.y, w: item.w, h: item.h };
  }
}
export function unionRect(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
export const rectsIntersect = (a: Rect, b: Rect) =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
export const insideRect = (p: Point, r: Rect) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

export function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function distanceToPolyline(p: Point, pts: Point[]) {
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++)
    best = Math.min(best, distanceToSegment(p, pts[i - 1], pts[i]));
  return best;
}
function insideRotated(p: Point, x: number, y: number, w: number, h: number, rot: number) {
  const cx = x + w / 2,
    cy = y + h / 2,
    a = (-rot * Math.PI) / 180;
  const dx = p.x - cx,
    dy = p.y - cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a),
    ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
}
function shapeOutline(item: ShapeItem): Point[] {
  const x = Math.min(item.x1, item.x2),
    y = Math.min(item.y1, item.y2),
    w = Math.abs(item.x2 - item.x1),
    h = Math.abs(item.y2 - item.y1);
  switch (item.shape) {
    case 'line':
    case 'arrow':
      return [
        { x: item.x1, y: item.y1 },
        { x: item.x2, y: item.y2 },
      ];
    case 'rect':
      return [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y },
      ];
    case 'triangle':
      return [
        { x: x + w / 2, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x: x + w / 2, y },
      ];
    case 'ellipse':
      return Array.from({ length: 33 }, (_, i) => {
        const a = (i / 32) * Math.PI * 2;
        return { x: x + w / 2 + (Math.cos(a) * w) / 2, y: y + h / 2 + (Math.sin(a) * h) / 2 };
      });
  }
}
export function pointInPolygon(p: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** Whether `p` touches the item, `tolerance` page pixels around thin marks. */
export function hitItem(item: PageItem, p: Point, tolerance: number, textHeight?: number) {
  switch (item.type) {
    case 'stroke':
      return distanceToPolyline(p, strokePoints(item)) <= item.width / 2 + tolerance;
    case 'shape': {
      const outline = shapeOutline(item);
      if (
        item.fill &&
        item.shape !== 'line' &&
        item.shape !== 'arrow' &&
        pointInPolygon(p, outline)
      )
        return true;
      return distanceToPolyline(p, outline) <= item.width / 2 + tolerance;
    }
    case 'image':
    case 'sticker':
      return insideRotated(p, item.x, item.y, item.w, item.h, item.rot);
    case 'text':
    case 'quote':
      return insideRect(p, itemBounds(item, textHeight));
  }
}
/** The topmost item under the point, if any. */
export function topItemAt(
  items: PageItem[],
  p: Point,
  tolerance: number,
  heights: Map<string, number> = new Map(),
) {
  for (let i = items.length - 1; i >= 0; i--)
    if (hitItem(items[i], p, tolerance, heights.get(items[i].id))) return items[i];
  return null;
}
/** Items a lasso encloses: most of a stroke's points, or the center of anything else. */
export function itemsInLasso(
  items: PageItem[],
  polygon: Point[],
  heights: Map<string, number> = new Map(),
) {
  if (polygon.length < 3) return [];
  return items.filter((item) => {
    if (item.type === 'stroke') {
      const pts = strokePoints(item);
      const inside = pts.filter((p) => pointInPolygon(p, polygon)).length;
      return inside > 0 && inside >= pts.length / 2;
    }
    const b = itemBounds(item, heights.get(item.id));
    return pointInPolygon({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, polygon);
  });
}
export function itemsInRect(
  items: PageItem[],
  rect: Rect,
  heights: Map<string, number> = new Map(),
) {
  return items.filter((item) => {
    if (item.type === 'stroke') return strokePoints(item).some((p) => insideRect(p, rect));
    return rectsIntersect(itemBounds(item, heights.get(item.id)), rect);
  });
}

// ---- Transforms -------------------------------------------------------------------------------

export function translateItem(item: PageItem, dx: number, dy: number): PageItem {
  switch (item.type) {
    case 'stroke':
      return {
        ...item,
        points: item.points.map((v, i) =>
          i % 3 === 0 ? round(v + dx) : i % 3 === 1 ? round(v + dy) : v,
        ),
      };
    case 'shape':
      return {
        ...item,
        x1: round(item.x1 + dx),
        y1: round(item.y1 + dy),
        x2: round(item.x2 + dx),
        y2: round(item.y2 + dy),
      };
    default:
      return { ...item, x: round(item.x + dx), y: round(item.y + dy) };
  }
}
/** Maps items from one box to another (resizing a selection); text keeps its line height ratio. */
export function scaleItem(item: PageItem, from: Rect, to: Rect): PageItem {
  const sx = from.w ? to.w / from.w : 1,
    sy = from.h ? to.h / from.h : 1;
  const mx = (x: number) => round(to.x + (x - from.x) * sx);
  const my = (y: number) => round(to.y + (y - from.y) * sy);
  switch (item.type) {
    case 'stroke':
      return {
        ...item,
        points: item.points.map((v, i) => (i % 3 === 0 ? mx(v) : i % 3 === 1 ? my(v) : v)),
      };
    case 'shape':
      return { ...item, x1: mx(item.x1), y1: my(item.y1), x2: mx(item.x2), y2: my(item.y2) };
    case 'text': {
      const scale = Math.sqrt(Math.abs(sx * sy));
      return {
        ...item,
        x: mx(item.x),
        y: my(item.y),
        w: Math.max(20, round(item.w * Math.abs(sx))),
        size: Math.min(144, Math.max(8, round(item.size * scale))),
      };
    }
    case 'quote':
      return {
        ...item,
        x: mx(item.x),
        y: my(item.y),
        w: Math.max(120, round(item.w * Math.abs(sx))),
        h: Math.max(40, round(item.h * Math.abs(sy))),
      };
    default:
      return {
        ...item,
        x: mx(item.x),
        y: my(item.y),
        w: Math.max(4, round(item.w * Math.abs(sx))),
        h: Math.max(4, round(item.h * Math.abs(sy))),
      };
  }
}
export function recolorItem(item: PageItem, color: string): PageItem {
  if (item.type === 'stroke' || item.type === 'shape') return { ...item, color };
  if (item.type === 'text')
    return {
      ...item,
      color,
      blocks: item.blocks.map((b) => ({
        ...b,
        runs: b.runs.map((run) => {
          const copy = { ...run };
          delete copy.c;
          return copy;
        }),
      })),
    };
  return item;
}

// ---- Strokes ----------------------------------------------------------------------------------

/** Ramer–Douglas–Peucker on [x, y, p] triples; keeps pressure of kept points. */
export function simplifyStroke(points: number[], epsilon = 0.35): number[] {
  const n = points.length / 3;
  if (n <= 2) return points.map(round);
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const a = { x: points[s * 3], y: points[s * 3 + 1] },
      b = { x: points[e * 3], y: points[e * 3 + 1] };
    let index = -1,
      worst = 0;
    for (let i = s + 1; i < e; i++) {
      const d = distanceToSegment({ x: points[i * 3], y: points[i * 3 + 1] }, a, b);
      if (d > worst) {
        worst = d;
        index = i;
      }
    }
    if (worst > epsilon && index > 0) {
      keep[index] = 1;
      stack.push([s, index], [index, e]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++)
    if (keep[i]) out.push(round(points[i * 3]), round(points[i * 3 + 1]), round(points[i * 3 + 2]));
  return out;
}
/** Splits a long stroke so each part stays within the API's point limit. */
export function splitLongStroke(item: StrokeItem): StrokeItem[] {
  const max = MAX_STROKE_POINTS * 3;
  if (item.points.length <= max) return [item];
  const parts: StrokeItem[] = [];
  for (let start = 0; start < item.points.length; start += max - 3) {
    const points = item.points.slice(start, start + max);
    if (points.length >= 3)
      parts.push({ ...item, id: parts.length ? newId('s') : item.id, points });
  }
  return parts;
}
/** Adds points so no two neighbours are further apart than `step` (for precise partial erase). */
function resample(points: number[], step: number) {
  const out: number[] = [points[0], points[1], points[2]];
  for (let i = 3; i + 2 < points.length; i += 3) {
    const x0 = points[i - 3],
      y0 = points[i - 2],
      p0 = points[i - 1];
    const x1 = points[i],
      y1 = points[i + 1],
      p1 = points[i + 2];
    const parts = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step);
    for (let k = 1; k <= parts; k++) {
      const t = k / parts;
      out.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, p0 + (p1 - p0) * t);
    }
  }
  return out;
}
/**
 * Partial eraser: removes the parts of strokes inside the circle, splitting a stroke into the
 * pieces left on either side. Shapes, text and images are not touched by the partial eraser.
 */
export function eraseCircle(items: PageItem[], center: Point, radius: number): PageItem[] {
  let changed = false;
  const out: PageItem[] = [];
  for (const item of items) {
    if (item.type !== 'stroke') {
      out.push(item);
      continue;
    }
    const b = itemBounds(item);
    if (
      center.x + radius < b.x ||
      center.x - radius > b.x + b.w ||
      center.y + radius < b.y ||
      center.y - radius > b.y + b.h
    ) {
      out.push(item);
      continue;
    }
    const reach = radius + item.width / 2;
    const dense = resample(item.points, Math.max(1, reach / 3));
    const pieces: number[][] = [];
    let current: number[] = [];
    for (let i = 0; i + 2 < dense.length; i += 3) {
      const inside = Math.hypot(dense[i] - center.x, dense[i + 1] - center.y) <= reach;
      if (inside) {
        if (current.length) pieces.push(current);
        current = [];
      } else current.push(dense[i], dense[i + 1], dense[i + 2]);
    }
    if (current.length) pieces.push(current);
    const untouched = pieces.length === 1 && pieces[0].length === dense.length;
    if (untouched) {
      out.push(item);
      continue;
    }
    changed = true;
    pieces.forEach((piece, index) => {
      if (piece.length < 6) return;
      out.push({ ...item, id: index === 0 ? item.id : newId('s'), points: simplifyStroke(piece) });
    });
  }
  return changed ? out : items;
}
/** Whole-object eraser: the ids of strokes and shapes the circle touches. */
export function erasedIds(items: PageItem[], center: Point, radius: number) {
  return items
    .filter(
      (item) => (item.type === 'stroke' || item.type === 'shape') && hitItem(item, center, radius),
    )
    .map((item) => item.id);
}

/**
 * "Vẽ rồi giữ yên": turns a hand-drawn stroke into a clean line, rectangle, triangle or ellipse.
 * Returns null when the stroke does not look like one of them.
 */
export function recognizeShape(points: Point[]): {
  shape: 'line' | 'rect' | 'triangle' | 'ellipse';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} | null {
  if (points.length < 4) return null;
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const diag = Math.hypot(maxX - minX, maxY - minY);
  if (diag < 24) return null;
  const first = points[0],
    last = points[points.length - 1];
  const gap = Math.hypot(last.x - first.x, last.y - first.y);
  // Open strokes: a straight line when every point stays close to the chord.
  if (gap > diag * 0.3) {
    const off = Math.max(...points.map((p) => distanceToSegment(p, first, last)));
    return off <= Math.max(6, diag * 0.06)
      ? { shape: 'line', x1: first.x, y1: first.y, x2: last.x, y2: last.y }
      : null;
  }
  // Closed strokes: count corners on a simplified outline.
  const flat = points.flatMap((p) => [p.x, p.y, 0.5]);
  const simple = simplifyStroke(flat, diag * 0.08);
  const corners: Point[] = [];
  for (let i = 0; i + 2 < simple.length; i += 3) corners.push({ x: simple[i], y: simple[i + 1] });
  // The closing point repeats the first corner.
  if (
    corners.length > 2 &&
    Math.hypot(corners[0].x - corners.at(-1)!.x, corners[0].y - corners.at(-1)!.y) < diag * 0.2
  )
    corners.pop();
  const box = { x1: minX, y1: minY, x2: maxX, y2: maxY };
  if (corners.length === 3) return { shape: 'triangle', ...box };
  if (corners.length === 4) {
    // A rectangle's corners sit near the bounding box corners.
    const near = corners.every(
      (c) =>
        Math.min(Math.abs(c.x - minX), Math.abs(c.x - maxX)) < diag * 0.15 &&
        Math.min(Math.abs(c.y - minY), Math.abs(c.y - maxY)) < diag * 0.15,
    );
    if (near) return { shape: 'rect', ...box };
  }
  // Round enough: points keep a steady distance from the center, scaled to the box.
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2,
    rx = (maxX - minX) / 2 || 1,
    ry = (maxY - minY) / 2 || 1;
  const radii = points.map((p) => Math.hypot((p.x - cx) / rx, (p.y - cy) / ry));
  const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
  const spread = Math.sqrt(radii.reduce((a, r) => a + (r - mean) ** 2, 0) / radii.length);
  if (corners.length >= 5 && spread < 0.16) return { shape: 'ellipse', ...box };
  if (corners.length === 4) return { shape: 'rect', ...box };
  return null;
}

// ---- Content helpers --------------------------------------------------------------------------

export function plainText(item: TextItem) {
  return item.blocks.map((b) => b.runs.map((r) => r.t).join('')).join('\n');
}
export const textIsEmpty = (item: TextItem) => !plainText(item).trim();
export function emptyText(
  x: number,
  y: number,
  defaults: Pick<TextItem, 'font' | 'size' | 'color'>,
): TextItem {
  return {
    id: newId('t'),
    type: 'text',
    x: round(x),
    y: round(y),
    w: 320,
    font: defaults.font,
    size: defaults.size,
    color: defaults.color,
    align: 'left',
    bg: null,
    blocks: [{ list: null, runs: [] }],
  };
}
export function contentBytes(content: PageContent) {
  return new TextEncoder().encode(JSON.stringify(content)).length;
}
/** Bounds of everything on a page, for fitting an infinite page into a print sheet. */
export function contentBounds(items: PageItem[], heights: Map<string, number> = new Map()) {
  return unionRect(items.map((i) => itemBounds(i, heights.get(i.id))));
}

// ---- Drag and drop ----------------------------------------------------------------------------

/**
 * What another page put on the clipboard or drag data. Google Images links its thumbnails to
 * `/imgres?imgurl=<full image>&…`; that URL is preferred over the (small) thumbnail itself.
 * Thumbnails are often `data:` URLs, which are converted in the browser, never sent as URLs.
 */
export function droppedImageSource(html: string, uriList: string, plain: string) {
  const candidates: string[] = [];
  const fromHref = (href: string) => {
    try {
      const url = new URL(href, 'https://www.google.com');
      const original = url.searchParams.get('imgurl') ?? url.searchParams.get('mediaurl');
      if (original) candidates.push(original);
    } catch {
      /* Not a URL. */
    }
  };
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi))
    fromHref(decodeEntities(match[2] ?? match[3] ?? ''));
  for (const match of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*("([^"]*)"|'([^']*)')/gi))
    candidates.push(decodeEntities(match[2] ?? match[3] ?? ''));
  for (const line of uriList.split(/\r?\n/)) {
    const value = line.trim();
    if (value && !value.startsWith('#')) {
      fromHref(value);
      candidates.push(value);
    }
  }
  if (plain.trim()) {
    fromHref(plain.trim());
    candidates.push(plain.trim());
  }
  for (const candidate of candidates) {
    if (/^data:image\/(png|jpeg|gif|webp|avif);base64,/i.test(candidate))
      return { kind: 'data' as const, value: candidate };
    if (/^https?:\/\//i.test(candidate) && candidate.length <= 2048)
      return { kind: 'url' as const, value: candidate };
  }
  return null;
}
function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
/** A `data:` image as bytes, without fetch (CSP may block data: fetches). */
export function dataUrlToBlob(value: string): Blob | null {
  const match = /^data:(image\/(?:png|jpeg|gif|webp|avif));base64,([A-Za-z0-9+/=\s]+)$/i.exec(
    value,
  );
  if (!match) return null;
  try {
    const binary = atob(match[2].replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: match[1].toLowerCase() });
  } catch {
    return null;
  }
}
/** Places an image of the given pixel size to fit within `maxW` × `maxH`, centered on `at`. */
export function fitImage(width: number, height: number, at: Point, maxW: number, maxH: number) {
  const scale = Math.min(1, maxW / width, maxH / height);
  const w = round(width * scale),
    h = round(height * scale);
  return { x: round(at.x - w / 2), y: round(at.y - h / 2), w, h };
}
