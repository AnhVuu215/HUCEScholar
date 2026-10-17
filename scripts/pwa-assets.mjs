import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import ts from 'typescript';

const publicRoot = new URL('../apps/web/public/', import.meta.url);
mkdirSync(new URL('icons/', publicRoot), { recursive: true });

// Rasterize the existing code-native H monogram at 4x sampling. No external assets or libraries.
function icon(size, maskable = false) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let covered = 0;
      let white = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const px = ((x + (sx + 0.5) / 4) / size) * 128;
          const py = ((y + (sy + 0.5) / 4) / size) * 128;
          const dx = Math.max(24 - px, px - 104, 0);
          const dy = Math.max(24 - py, py - 104, 0);
          if (maskable || dx * dx + dy * dy <= 24 * 24) covered++;
          if (
            py >= 30 &&
            py < 98 &&
            ((px >= 30 && px < 44) ||
              (px >= 84 && px < 98) ||
              (px >= 44 && px < 84 && py >= 57 && py < 71))
          )
            white++;
        }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 3; c++)
        pixels[offset + c] = Math.round([0, 30, 66][c] + ((255 - [0, 30, 66][c]) * white) / 16);
      pixels[offset + 3] = Math.round((255 * covered) / 16);
    }
  }
  function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
for (const [name, size, maskable] of [
  ['icon-192', 192, false],
  ['icon-512', 512, false],
  ['maskable-512', 512, true],
  ['apple-touch-icon', 180, true],
])
  writeFileSync(new URL(`icons/${name}.png`, publicRoot), icon(size, maskable));

const source = readFileSync(new URL('pwa-worker.ts', import.meta.url), 'utf8');
const result = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
});
writeFileSync(new URL('sw.js', publicRoot), result.outputText);
