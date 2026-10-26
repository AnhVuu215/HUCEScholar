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
  /** READ-04: above the text layer, holds the clickable sticky notes. */
  pins: HTMLDivElement;
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
/** A point on the rendered page (CSS px from its top-left) as a stored note position. */
export function pagePointToPosition(
  clientX: number,
  clientY: number,
  surface: Pick<HighlightSurface, 'element' | 'viewport'>,
) {
  const page = surface.element.getBoundingClientRect(),
    v = surface.viewport;
  const x = (Math.min(Math.max(clientX - page.left, 0), page.width) * v.width) / page.width;
  const y = (Math.min(Math.max(clientY - page.top, 0), page.height) * v.height) / page.height;
  const [x0, y0, x1, y1] = v.viewBox;
  const [px, py] = v.convertToPdfPoint(x, y);
  return { x: normalize((px - x0) / (x1 - x0)), y: normalize((py - y0) / (y1 - y0)) };
}
/** A stored note position in viewport px on the current render (zoom and rotation applied). */
export function positionToViewport(
  position: { x: number; y: number },
  viewport: HighlightViewport,
) {
  const [x0, y0, x1, y1] = viewport.viewBox;
  const [left, top] = viewport.convertToViewportPoint(
    x0 + position.x * (x1 - x0),
    y0 + position.y * (y1 - y0),
  );
  return { left, top };
}
/** Where a sticky note is drawn: at its point, kept inside the page, at most 180px wide. */
export function pinBox(position: { x: number; y: number }, viewport: HighlightViewport) {
  const { left, top } = positionToViewport(position, viewport);
  const width = Math.min(180, viewport.width * 0.5);
  return {
    left: Math.max(0, Math.min(left, viewport.width - width)),
    top: Math.max(0, Math.min(top, viewport.height - 32)),
    width,
  };
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
