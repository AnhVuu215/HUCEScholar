import { createServer } from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileConfiguration } from '../src/files/files.config';
import { receivePdf, pdfHeaders } from '../src/files/receive-pdf';
import { clamScan, parsePdfInfo, runTool } from '../src/files/pdf-scanner';

describe('bounded PDF checks', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'hs-pdf-test-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  it('requires S3 in production and bounded sizes', () => {
    expect(() => fileConfiguration({ NODE_ENV: 'production' })).toThrow();
    expect(() => fileConfiguration({ PDF_MAX_BYTES: '0' })).toThrow();
    expect(
      fileConfiguration({
        NODE_ENV: 'production',
        FILE_STORAGE: 's3',
        S3_BUCKET: 'private-test',
        AWS_REGION: 'ap-southeast-1',
      }).driver,
    ).toBe('s3');
  });
  it('rejects paths, invalid headers and weak revision matches', () => {
    expect(() => pdfHeaders('application/pdf', '..%2Fa.pdf', '"1"')).toThrow();
    expect(() => pdfHeaders('application/pdf', 'a.pdf', 'W/"1"')).toThrow();
    expect(pdfHeaders('application/pdf', 'a.pdf', '"2"')).toEqual({ name: 'a.pdf', revision: 2 });
  });
  it('limits actual bytes even without Content-Length', async () => {
    await expect(
      receivePdf(
        Readable.from([Buffer.from('%PDF-1.7'), Buffer.alloc(20)]),
        join(directory, 'large.pdf'),
        10,
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      receivePdf(Readable.from([Buffer.from('bad')]), join(directory, 'bad.pdf'), 20),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('accepts PDFs that open without a password and flags copy:no', () => {
    expect(parsePdfInfo('Pages: 2\nEncrypted: no\n')).toEqual({
      pageCount: 2,
      copyRestricted: false,
    });
    expect(
      parsePdfInfo(
        'Pages: 3\nEncrypted: yes (print:yes copy:no change:yes addNotes:yes algorithm:RC4)\n',
      ),
    ).toEqual({ pageCount: 3, copyRestricted: true });
    expect(parsePdfInfo('Pages: 1\nEncrypted: yes (print:no copy:yes)\n')).toEqual({
      pageCount: 1,
      copyRestricted: false,
    });
  });
  it('classifies malformed and oversized page counts as the file’s fault', () => {
    for (const output of ['Pages: 0\nEncrypted: no', 'syntax error', 'Pages: 1'])
      expect(() => parsePdfInfo(output)).toThrow(
        expect.objectContaining({ retryable: false, code: 'INVALID_PDF' }),
      );
    expect(() => parsePdfInfo('Pages: 10001\nEncrypted: no')).toThrow(
      expect.objectContaining({ retryable: false, code: 'TOO_MANY_PAGES' }),
    );
  });
  it('tells a password-protected PDF apart from a broken one by exit plus stderr', async () => {
    await expect(
      runTool(
        process.execPath,
        ['-e', 'process.stderr.write("Command Line Error: Incorrect password\\n");process.exit(1)'],
        5000,
      ),
    ).rejects.toMatchObject({ retryable: false, code: 'PASSWORD_PROTECTED' });
    await expect(
      runTool(
        process.execPath,
        [
          '-e',
          'process.stderr.write("Syntax Error: Couldn\'t read xref table\\n");process.exit(1)',
        ],
        5000,
      ),
    ).rejects.toMatchObject({ retryable: false, code: 'INVALID_PDF' });
  });
  it('bounds parser execution and output without invoking a shell', async () => {
    await expect(
      runTool(process.execPath, ['-e', 'process.stdout.write("valid")'], 1000),
    ).resolves.toBe('valid');
    await expect(
      runTool(process.execPath, ['-e', 'setTimeout(()=>{},3000)'], 100),
    ).rejects.toThrow();
    await expect(
      runTool(process.execPath, ['-e', 'process.stdout.write("x".repeat(40000))'], 1000),
    ).rejects.toThrow();
    await expect(runTool(process.execPath, ['-e', 'process.exit(1)'], 1000)).rejects.toThrow();
  });
  it.each(['stream: OK\0', 'stream: Test FOUND\0', 'stream: size limit ERROR\0'])(
    'requires an exact ClamAV clean response: %s',
    async (reply) => {
      const path = join(directory, 'file.pdf');
      await writeFile(path, '%PDF-1.7\ntest');
      const server = createServer((socket) => {
        let content = Buffer.alloc(0);
        socket.on('data', (chunk) => {
          content = Buffer.concat([content, chunk]);
          if (content.length > 10 && content.subarray(-4).equals(Buffer.alloc(4)))
            socket.end(reply);
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server missing');
      try {
        const scan = clamScan(path, '127.0.0.1', address.port, 1000);
        if (reply === 'stream: OK\0') await expect(scan).resolves.toBeUndefined();
        else
          await expect(scan).rejects.toMatchObject(
            reply.includes(' FOUND')
              ? { retryable: false, code: 'MALWARE' }
              : { retryable: true, code: null },
          );
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );
});
