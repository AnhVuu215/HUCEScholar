import { createRequire } from 'node:module';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(new URL('../apps/web/package.json', import.meta.url)));
const require = createRequire(join(root, 'package.json'));
const source = dirname(require.resolve('pdfjs-dist/package.json'));
const { version } = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
const target = join(root, 'public/pdfjs', version);
await mkdir(target, { recursive: true });
for (const name of ['cmaps', 'standard_fonts', 'wasm', 'LICENSE'])
  await cp(join(source, name), join(target, name), { recursive: true });
await cp(join(source, 'build/pdf.worker.min.mjs'), join(target, 'pdf.worker.min.mjs'));
console.log(`Prepared self-hosted PDF.js ${version} assets.`);
