import { spawn } from 'node:child_process';
import { FileCheckError } from './pdf-scanner';

/** Keeps one PDF's text bounded: a 400-page book is about 1 MB, so this is rarely reached. */
export const MAX_TEXT_BYTES = 8 * 1024 * 1024;
export const MAX_PAGE_CHARS = 20_000;
const EXTRACT_TIMEOUT_MS = 120_000;

// Control characters cannot be stored in a PostgreSQL text column (NUL) or searched usefully.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

/** pdftotext ends every page with a form feed; empty pages keep their place in the numbering. */
export function pagesFromText(raw: string) {
  return raw.split('\f').flatMap((text, index) => {
    const content = text
      .normalize('NFC')
      .replace(CONTROL, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_PAGE_CHARS);
    return content ? [{ pageNumber: index + 1, content }] : [];
  });
}

/** Text of a checked PDF; past MAX_TEXT_BYTES it stops and keeps the pages read so far. */
export function extractPdfText(binary: string, path: string, maxBytes = MAX_TEXT_BYTES) {
  return new Promise<{ text: string; truncated: boolean }>((resolve, reject) => {
    const child = spawn(binary, ['-enc', 'UTF-8', path, '-'], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, EXTRACT_TIMEOUT_MS);
    child.stdout.on('data', (data: Buffer) => {
      if (truncated) return;
      chunks.push(data);
      size += data.length;
      if (size > maxBytes) {
        truncated = true;
        child.kill('SIGKILL');
      }
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new FileCheckError(true));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut || (code !== 0 && !truncated)) return reject(new FileCheckError(true));
      const text = Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8');
      // The page cut off at the limit is partial, so it is dropped rather than half indexed.
      resolve({ text: truncated ? text.slice(0, text.lastIndexOf('\f') + 1) : text, truncated });
    });
  });
}
