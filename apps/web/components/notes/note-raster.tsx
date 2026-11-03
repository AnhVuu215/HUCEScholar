'use client';

import { memo, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { Rect, StrokeItem } from '../../lib/note-model';
import { cachedOutlinePoints } from './note-render';

/**
 * CANVAS-01 / PERF-01: on pages with many strokes, runs of consecutive saved strokes are painted
 * into 512-px canvas tiles shown as SVG <image>s, instead of one SVG path each. A page of 2 000
 * strokes otherwise costs 2 000 DOM nodes in the editor and again in its thumbnail. Tiles are
 * cached by scale and by the strokes they hold, so panning reuses them and an edit repaints
 * only the tiles it touches. Print and export keep drawing vector paths.
 */

/** Pages with fewer strokes keep plain SVG. */
export const RASTER_MIN_STROKES = 300;
/** Shorter runs (between images or text boxes) stay SVG too. */
export const RASTER_MIN_RUN = 24;
export type RasterView = { scale: number; area: Rect };

const TILE = 512;
const MAX_TILES_PER_VIEW = 64;
const CACHE_LIMIT = 320;
/** While tiles are being painted, at most this many strokes are drawn as SVG meanwhile. */
const OVERLAY_LIMIT = 200;

// ---- Per-stroke data, computed once per immutable item ------------------------------------------

const uids = new WeakMap<StrokeItem, number>();
let nextUid = 1;
const uid = (item: StrokeItem) => {
  let id = uids.get(item);
  if (!id) {
    id = nextUid++;
    uids.set(item, id);
  }
  return id;
};
const boxes = new WeakMap<StrokeItem, Rect>();
function strokeBox(item: StrokeItem): Rect {
  let box = boxes.get(item);
  if (!box) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const [x, y] of cachedOutlinePoints(item)) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    box =
      minX === Infinity
        ? { x: 0, y: 0, w: 0, h: 0 }
        : { x: minX - 1, y: minY - 1, w: maxX - minX + 2, h: maxY - minY + 2 };
    boxes.set(item, box);
  }
  return box;
}
const paths = new WeakMap<StrokeItem, Path2D>();
/** The same quadratic outline as the SVG path, built straight from the points. */
function strokePath(item: StrokeItem) {
  let path = paths.get(item);
  if (!path) {
    path = new Path2D();
    const o = cachedOutlinePoints(item);
    if (o.length > 1) {
      path.moveTo(o[0][0], o[0][1]);
      for (let i = 0; i < o.length; i++) {
        const a = o[i],
          b = o[(i + 1) % o.length];
        path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      }
      path.closePath();
    }
    paths.set(item, path);
  }
  return path;
}
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Pencil grain: the colour at a noisy opacity, like the SVG `note-pencil` filter. */
const grains = new Map<string, CanvasPattern | null>();
function pencilGrain(ctx: OffscreenCanvasRenderingContext2D, color: string) {
  if (grains.has(color)) return grains.get(color)!;
  const size = 64;
  const tile = new OffscreenCanvas(size, size);
  const g = tile.getContext('2d');
  let pattern: CanvasPattern | null = null;
  if (g) {
    g.fillStyle = color;
    g.fillRect(0, 0, size, size);
    const image = g.getImageData(0, 0, size, size);
    let seed = 3;
    for (let i = 3; i < image.data.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const noise = (seed % 1000) / 1000;
      image.data[i] = Math.max(0, Math.min(255, (1.25 - 1.6 * noise * 0.75) * 255));
    }
    g.putImageData(image, 0, 0);
    pattern = ctx.createPattern(tile, 'repeat');
  }
  grains.set(color, pattern);
  return pattern;
}

// ---- Tile cache and the paint queue ------------------------------------------------------------

type Tile = { key: string; rect: Rect; scale: number; strokes: StrokeItem[]; uids: number[] };
type Entry = { url: string | null; uids: Set<number>; requested: number };
const entries = new Map<string, Entry>();
const pinned = new Map<string, number>();
const queue: Tile[] = [];
let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => version;

function evict() {
  if (entries.size <= CACHE_LIMIT) return;
  for (const [key, entry] of entries) {
    if (entries.size <= CACHE_LIMIT) break;
    if (pinned.has(key) || !entry.url) continue;
    URL.revokeObjectURL(entry.url);
    entries.delete(key);
  }
}
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function paint(tile: Tile) {
  const canvas = new OffscreenCanvas(TILE, TILE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const s = tile.scale;
  ctx.setTransform(s, 0, 0, s, -tile.rect.x * s, -tile.rect.y * s);
  // Slices keep each task short on slow machines.
  for (let i = 0; i < tile.strokes.length; i++) {
    const item = tile.strokes[i];
    ctx.globalCompositeOperation = item.tool === 'highlighter' ? 'multiply' : 'source-over';
    ctx.globalAlpha = item.tool === 'highlighter' ? 0.42 : item.tool === 'pencil' ? 0.82 : 1;
    ctx.fillStyle = (item.tool === 'pencil' && pencilGrain(ctx, item.color)) || item.color;
    ctx.fill(strokePath(item));
    if (i % 150 === 149) await pause();
  }
  return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/png' }));
}
// The worker paints and encodes off the main thread; without one, the page does it in slices.
let worker: Worker | null | undefined;
const sent = new Set<number>();
const waiting = new Map<string, (blob: Blob | null) => void>();
function rasterWorker() {
  if (worker !== undefined) return worker;
  try {
    worker =
      typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
        ? new Worker(new URL('./note-raster.worker.ts', import.meta.url))
        : null;
    worker?.addEventListener(
      'message',
      (event: MessageEvent<{ key: string; blob: Blob | null }>) => {
        waiting.get(event.data.key)?.(event.data.blob);
        waiting.delete(event.data.key);
      },
    );
    worker?.addEventListener('error', () => {
      worker = null;
      for (const done of waiting.values()) done(null);
      waiting.clear();
    });
  } catch {
    worker = null;
  }
  return worker;
}
async function paintInWorker(target: Worker, tile: Tile) {
  const transfer: ArrayBuffer[] = [];
  const strokes = tile.strokes.map((item, i) => {
    const id = tile.uids[i];
    if (sent.has(id)) return { uid: id, tool: item.tool, color: item.color };
    sent.add(id);
    const outline = new Float32Array(cachedOutlinePoints(item).flatMap((p) => [p[0], p[1]]));
    transfer.push(outline.buffer);
    return { uid: id, tool: item.tool, color: item.color, outline };
  });
  const blob = await new Promise<Blob | null>((resolve) => {
    waiting.set(tile.key, resolve);
    target.postMessage(
      { key: tile.key, scale: tile.scale, rect: tile.rect, size: TILE, strokes },
      transfer,
    );
  });
  return blob ? URL.createObjectURL(blob) : null;
}

/** Several tiles wait in the worker at once, so it never idles on a round trip. */
let inFlight = 0;
const painting = new Set<string>();
let notifyQueued = false;
function notifySoon() {
  if (notifyQueued) return;
  notifyQueued = true;
  // Tiles finishing together re-render the runs once.
  setTimeout(() => {
    notifyQueued = false;
    notify();
  }, 16);
}
function pump() {
  const target = rasterWorker();
  const limit = target ? 4 : 1;
  while (queue.length && inFlight < limit) {
    // Newest requests first: they are what the screen shows now.
    const tile = queue.pop()!;
    const entry = entries.get(tile.key);
    if (!entry || entry.url || painting.has(tile.key) || Date.now() - entry.requested > 4000)
      continue;
    inFlight++;
    painting.add(tile.key);
    void (target ? paintInWorker(target, tile) : paint(tile))
      .catch(() => null)
      .then(async (url) => {
        if (url && entries.get(tile.key) === entry) {
          entry.url = url;
          notifySoon();
        } else if (url) URL.revokeObjectURL(url);
        evict();
        if (!target) await pause();
        painting.delete(tile.key);
        inFlight--;
        pump();
      });
  }
}
function request(tile: Tile) {
  const now = Date.now();
  const entry = entries.get(tile.key);
  if (entry) {
    entry.requested = now;
    // Most recently used last, for eviction.
    entries.delete(tile.key);
    entries.set(tile.key, entry);
    if (entry.url) return true;
  } else {
    entries.set(tile.key, { url: null, uids: new Set(tile.uids), requested: now });
  }
  if (!painting.has(tile.key) && !queue.some((t) => t.key === tile.key)) queue.push(tile);
  pump();
  return false;
}

/** FNV-1a over the stroke uids, so a tile's key changes when any of its strokes does. */
function hash(values: number[]) {
  let h = 0x811c9dc5;
  for (const v of values) {
    h ^= v;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// ---- The run component ---------------------------------------------------------------------------

/**
 * A run of consecutive strokes, painted as cached tiles over `view.area` at `view.scale` device
 * pixels per page unit. Until the tiles for the current view are ready, the last complete set
 * stays on screen and strokes it does not contain yet are drawn as SVG paths on top.
 */
export const RasterRun = memo(function RasterRun({
  strokes,
  view,
  renderStroke,
  blend = false,
}: {
  strokes: StrokeItem[];
  view: RasterView;
  renderStroke: (item: StrokeItem) => React.ReactNode;
  /** Highlighter tiles multiply with what lies under them, like the SVG strokes. */
  blend?: boolean;
}) {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const s = view.scale;
  const span = TILE / s;
  const range = {
    x0: Math.floor(view.area.x / span),
    y0: Math.floor(view.area.y / span),
    x1: Math.floor((view.area.x + view.area.w) / span),
    y1: Math.floor((view.area.y + view.area.h) / span),
  };
  const rangeKey = `${s}|${range.x0}|${range.y0}|${range.x1}|${range.y1}`;
  // Strokes binned by tile once per run and scale, so a pan only looks up the new cells.
  const bins = useMemo(() => {
    const map = new Map<string, StrokeItem[]>();
    for (const item of strokes) {
      const b = strokeBox(item);
      for (let ty = Math.floor(b.y / span); ty <= Math.floor((b.y + b.h) / span); ty++)
        for (let tx = Math.floor(b.x / span); tx <= Math.floor((b.x + b.w) / span); tx++) {
          const cell = `${tx},${ty}`;
          const list = map.get(cell);
          if (list) list.push(item);
          else map.set(cell, [item]);
        }
    }
    return map;
  }, [strokes, span]);
  const tiles = useMemo(() => {
    const out: Tile[] = [];
    const [, x0, y0, x1, y1] = rangeKey.split('|').map(Number);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        const inside = bins.get(`${tx},${ty}`);
        if (!inside) continue;
        const ids = inside.map(uid);
        out.push({
          key: `${s}|${tx}|${ty}|${ids.length}|${hash(ids)}`,
          rect: { x: tx * span, y: ty * span, w: span, h: span },
          scale: s,
          strokes: inside,
          uids: ids,
        });
      }
    return out;
  }, [bins, rangeKey, s, span]);

  const tooMany = tiles.length > MAX_TILES_PER_VIEW;
  const ready = !tooMany && tiles.every((t) => request(t));
  const shown = useRef<{ key: string; rect: Rect; url: string }[]>([]);
  const covered = useRef<Set<number>>(new Set());
  if (ready) {
    shown.current = tiles.map((t) => ({ key: t.key, rect: t.rect, url: entries.get(t.key)!.url! }));
    covered.current = new Set(tiles.flatMap((t) => t.uids));
  }
  const display = shown.current;
  // Tiles on screen are never evicted.
  const displayKey = display.map((t) => t.key).join(',');
  useEffect(() => {
    const keys = displayKey ? displayKey.split(',') : [];
    for (const key of keys) pinned.set(key, (pinned.get(key) ?? 0) + 1);
    return () => {
      for (const key of keys) {
        const n = (pinned.get(key) ?? 1) - 1;
        if (n) pinned.set(key, n);
        else pinned.delete(key);
      }
    };
  }, [displayKey]);

  const pending = ready
    ? []
    : strokes.filter(
        (item) => !covered.current.has(uid(item)) && overlaps(strokeBox(item), view.area),
      );
  return (
    <g
      data-note-raster={strokes.length}
      data-ready={ready || undefined}
      style={blend ? { mixBlendMode: 'multiply' } : undefined}
    >
      {display.map((t) => (
        <image
          key={t.key}
          href={t.url}
          x={t.rect.x}
          y={t.rect.y}
          width={t.rect.w}
          height={t.rect.h}
          preserveAspectRatio="none"
        />
      ))}
      {pending.length <= OVERLAY_LIMIT &&
        pending.map((item) => <g key={item.id}>{renderStroke(item)}</g>)}
    </g>
  );
});
