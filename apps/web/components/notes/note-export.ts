import { FONTS } from '../../lib/note-model';

/**
 * PNG export of one page. The page is drawn by an off-screen SVG (paper and items, no editor
 * chrome); fonts and images are inlined as data URLs because an SVG drawn as an image cannot load
 * anything else. Browsers that refuse to draw HTML-in-SVG (text boxes) report it instead.
 */
const FONT_FILES: Record<string, string[]> = Object.fromEntries(
  FONTS.map((f) => [
    f.id,
    ['latin', 'latin-ext', 'vietnamese'].map(
      (subset) => `/fonts/notes/${f.id}-400-${subset}.woff2`,
    ),
  ]),
);

async function dataUrl(url: string) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Asset unavailable.');
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function exportSvgToPng(svg: SVGSVGElement, fileName: string, scale = 2) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const width = Number(clone.getAttribute('width')),
    height = Number(clone.getAttribute('height'));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // Images: same-origin asset URLs and blob: previews become data URLs.
  for (const image of clone.querySelectorAll('image')) {
    const href = image.getAttribute('href');
    if (href && !href.startsWith('data:')) image.setAttribute('href', await dataUrl(href));
  }
  // Fonts actually used on the page, plus the interface font of quotes and stickers.
  const used = new Set(['be-vietnam-pro']);
  const text = new XMLSerializer().serializeToString(clone);
  for (const f of FONTS) if (text.includes(`Notes ${f.label.split(' (')[0]}`)) used.add(f.id);
  const faces: string[] = [];
  for (const id of used) {
    const family = FONTS.find((f) => f.id === id)!
      .family.split(',')[0]
      .replace(/'/g, '');
    for (const file of FONT_FILES[id]) {
      try {
        faces.push(
          `@font-face{font-family:'${family}';src:url(${await dataUrl(file)}) format('woff2');font-weight:100 900;}`,
        );
      } catch {
        /* A missing subset falls back to system fonts. */
      }
    }
  }
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = faces.join('\n');
  clone.insertBefore(style, clone.firstChild);
  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('SVG render failed.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d')!;
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG encode failed.');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  } finally {
    URL.revokeObjectURL(url);
  }
}
/** A file name from the notebook title: letters, digits and dashes only. */
export function exportName(title: string, page: number) {
  const base =
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'vo-ghi';
  return `${base}-trang-${page}.png`;
}
