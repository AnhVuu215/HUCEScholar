/// <reference lib="webworker" />
/**
 * Paints raster tiles of notebook strokes off the main thread and encodes them as PNG.
 * Outlines arrive once per stroke (by uid) and are kept here for later tiles.
 */
type Stroke = { uid: number; tool: string; color: string; outline?: Float32Array };
type Job = {
  key: string;
  scale: number;
  rect: { x: number; y: number; w: number; h: number };
  size: number;
  strokes: Stroke[];
};

const paths = new Map<number, Path2D>();
const grains = new Map<string, CanvasPattern | null>();

function pathOf(outline: Float32Array) {
  const path = new Path2D();
  const n = outline.length / 2;
  if (n > 1) {
    path.moveTo(outline[0], outline[1]);
    for (let i = 0; i < n; i++) {
      const j = ((i + 1) % n) * 2;
      const ax = outline[i * 2],
        ay = outline[i * 2 + 1];
      path.quadraticCurveTo(ax, ay, (ax + outline[j]) / 2, (ay + outline[j + 1]) / 2);
    }
    path.closePath();
  }
  return path;
}
function grain(ctx: OffscreenCanvasRenderingContext2D, color: string) {
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
      image.data[i] = Math.max(0, Math.min(255, (1.25 - 1.2 * ((seed % 1000) / 1000)) * 255));
    }
    g.putImageData(image, 0, 0);
    pattern = ctx.createPattern(tile, 'repeat');
  }
  grains.set(color, pattern);
  return pattern;
}

self.onmessage = async (event: MessageEvent<Job | { forget: number[] }>) => {
  const data = event.data;
  if ('forget' in data) {
    for (const uid of data.forget) paths.delete(uid);
    return;
  }
  try {
    const canvas = new OffscreenCanvas(data.size, data.size);
    const ctx = canvas.getContext('2d')!;
    const s = data.scale;
    ctx.setTransform(s, 0, 0, s, -data.rect.x * s, -data.rect.y * s);
    for (const stroke of data.strokes) {
      let path = paths.get(stroke.uid);
      if (!path && stroke.outline) {
        path = pathOf(stroke.outline);
        paths.set(stroke.uid, path);
      }
      if (!path) continue;
      ctx.globalCompositeOperation = stroke.tool === 'highlighter' ? 'multiply' : 'source-over';
      ctx.globalAlpha = stroke.tool === 'highlighter' ? 0.42 : stroke.tool === 'pencil' ? 0.82 : 1;
      ctx.fillStyle = (stroke.tool === 'pencil' && grain(ctx, stroke.color)) || stroke.color;
      ctx.fill(path);
    }
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ key: data.key, blob });
  } catch {
    self.postMessage({ key: data.key, blob: null });
  }
};
