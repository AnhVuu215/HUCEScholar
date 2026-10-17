import { createServer, type Server } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertDocx } from '../src/files/docx-converter-client';

let server: Server;
let directory: string;
let url: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'docx-client-test-'));
  await writeFile(join(directory, 'source.docx'), 'synthetic');
  server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'X-Converter-Build': 'fixture' });
      res.end('%PDF-1.7\nfixture');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});
it('writes a bounded PDF and its converter provenance', async () => {
  const output = join(directory, 'result.pdf');
  expect(await convertDocx(join(directory, 'source.docx'), output, url)).toEqual({
    converterBuild: 'fixture',
  });
  expect((await readFile(output)).subarray(0, 5).toString()).toBe('%PDF-');
});
it('rejects a fake PDF even if the converter reports success', async () => {
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    req.resume();
    res.setHeader('Content-Type', 'application/pdf');
    res.end('not a PDF');
  });
  await expect(
    convertDocx(join(directory, 'source.docx'), join(directory, 'result.pdf'), url),
  ).rejects.toThrow();
});
it('preserves a permanent package error without exposing converter output', async () => {
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    req.resume();
    res.writeHead(422, { 'Content-Type': 'application/json' });
    res.end('{"code":"INVALID_DOCX"}');
  });
  await expect(
    convertDocx(join(directory, 'source.docx'), join(directory, 'result.pdf'), url),
  ).rejects.toThrow('INVALID_DOCX');
});
it('removes an oversized PDF response instead of leaving a partial rendition', async () => {
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    req.resume();
    res.setHeader('Content-Type', 'application/pdf');
    const bytes = Buffer.alloc(26 * 1024 * 1024, 0x20);
    bytes.write('%PDF-1.7');
    res.end(bytes);
  });
  const output = join(directory, 'result.pdf');
  await expect(convertDocx(join(directory, 'source.docx'), output, url)).rejects.toThrow(
    'CONVERSION_FAILED',
  );
  await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('aborts a converter that never responds without creating a PDF', async () => {
  const controller = new AbortController();
  server.removeAllListeners('request');
  server.on('request', (req) => {
    req.resume();
    req.on('end', () => controller.abort());
  });
  const output = join(directory, 'result.pdf');
  await expect(
    convertDocx(join(directory, 'source.docx'), output, url, controller.signal),
  ).rejects.toThrow();
  await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });
});
