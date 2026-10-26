import type { PageViewport, PDFPageProxy } from 'pdfjs-dist';

/**
 * The viewport the reader draws a page at, so the interactive page, the continuous-scroll
 * previews (READ-05) and thumbnails all agree on size. PDF.js treats `rotation` as absolute;
 * adding the page's own /Rotate keeps scans upright.
 */
export function readerViewport(
  pdfPage: PDFPageProxy,
  zoom: string,
  rotation: number,
  width: number,
): { viewport: PageViewport; scale: number } {
  const turn = (pdfPage.rotate + rotation) % 360;
  const natural = pdfPage.getViewport({ scale: 1, rotation: turn });
  const scale = zoom === 'fit' ? width / natural.width : Number(zoom);
  return { viewport: pdfPage.getViewport({ scale, rotation: turn }), scale };
}

/** Device pixels per CSS pixel, bounding canvas memory for unusual pages and high-DPI screens. */
export function canvasRatio(viewport: { width: number; height: number }, max = 2) {
  return Math.min(
    window.devicePixelRatio || 1,
    max,
    4096 / Math.max(viewport.width, viewport.height),
    Math.sqrt(8_000_000 / (viewport.width * viewport.height)),
  );
}

/** Draws a page without its text layer; resolves once the canvas is painted or rejects. */
export async function paintPage(
  pdfPage: PDFPageProxy,
  viewport: PageViewport,
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  maxRatio = 2,
) {
  const ratio = canvasRatio(viewport, maxRatio);
  canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
  canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  const task = pdfPage.render({
    canvas,
    viewport,
    transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
  });
  const cancel = () => task.cancel();
  signal.addEventListener('abort', cancel);
  try {
    await task.promise;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
