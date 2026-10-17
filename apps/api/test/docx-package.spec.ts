import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const python = process.env.DOCX_PYTHON ?? 'python3';
const script = resolve('src/files/validate-docx.py');
const fixture = (name: string) => resolve('test/fixtures/docx', name);
function validate(name: string) {
  return execFileSync(python, [script, fixture(name)], { timeout: 20_000, stdio: 'pipe' });
}
it.each(['vietnamese.docx', 'hyperlink.docx'])('validates Word package %s', (name) => {
  expect(() => validate(name)).not.toThrow();
});
it.each([
  'ordinary-zip.docx',
  'macro.docx',
  'traversal.docx',
  'entity.docx',
  'external-image.docx',
  'oversized.docx',
  'encrypted.docx',
  'symlink.docx',
  'lying-size.docx',
])('rejects unsafe package %s', (name) => {
  expect(() => validate(name)).toThrow();
});
