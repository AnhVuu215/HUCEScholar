import type { HighlightAnchor } from './highlights';
import type { PdfTextPart } from './pdf-find';
export interface HighlightViewport {
  width: number;
  height: number;
  viewBox: number[];
  convertToPdfPoint(x: number, y: number): number[];
  convertToViewportPoint(x: number, y: number): number[];
}
export interface HighlightSurface {
  key: string;
  page: number;
  element: HTMLDivElement;
  layer: HTMLDivElement;
  overlay: HTMLDivElement;
  viewport: HighlightViewport;
  text?: { parts: PdfTextPart[]; elements: HTMLElement[] };
}
const normalize = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 1e6) / 1e6;
export function rectToQuad(
  rect: { left: number; top: number; right: number; bottom: number },
  viewport: HighlightViewport,
): number[] {
  const [x0, y0, x1, y1] = viewport.viewBox;
  return [
    [rect.left, rect.top],
    [rect.right, rect.top],
    [rect.right, rect.bottom],
    [rect.left, rect.bottom],
  ].flatMap(([x, y]) => {
    const [px, py] = viewport.convertToPdfPoint(x, y);
    return [normalize((px - x0) / (x1 - x0)), normalize((py - y0) / (y1 - y0))];
  });
}
export function quadBounds(quad: number[], viewport: HighlightViewport) {
  const [x0, y0, x1, y1] = viewport.viewBox,
    xs: number[] = [],
    ys: number[] = [];
  for (let i = 0; i < 8; i += 2) {
    const [x, y] = viewport.convertToViewportPoint(
      x0 + quad[i] * (x1 - x0),
      y0 + quad[i + 1] * (y1 - y0),
    );
    xs.push(x);
    ys.push(y);
  }
  const left = Math.min(...xs),
    top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}
export function selectedAnchor(surface: HighlightSurface): HighlightAnchor | null {
  const selection = window.getSelection();
  if (
    !selection ||
    selection.isCollapsed ||
    selection.rangeCount !== 1 ||
    !surface.layer.isConnected
  )
    return null;
  const range = selection.getRangeAt(0),
    quote = selection.toString().trim();
  if (
    !surface.layer.contains(range.startContainer) ||
    !surface.layer.contains(range.endContainer) ||
    !quote ||
    quote.length > 2000
  )
    return null;
  const page = surface.element.getBoundingClientRect(),
    v = surface.viewport;
  const quads = Array.from(range.getClientRects())
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .map((r) =>
      rectToQuad(
        {
          left: (Math.max(0, r.left - page.left) * v.width) / page.width,
          top: (Math.max(0, r.top - page.top) * v.height) / page.height,
          right: (Math.min(page.width, r.right - page.left) * v.width) / page.width,
          bottom: (Math.min(page.height, r.bottom - page.top) * v.height) / page.height,
        },
        v,
      ),
    );
  const unique = [...new Map(quads.map((q) => [JSON.stringify(q), q])).values()];
  if (!unique.length || unique.length > 100) return null;
  return { coordinateSpace: 'normalized-pdf-v1', quote, quads: unique };
}
