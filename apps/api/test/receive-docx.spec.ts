import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { docxHeaders, receiveDocx } from '../src/files/receive-docx';

describe('bounded Word intake', () => {
  it('requires a DOCX name, exact MIME, revision and idempotency key', () => {
    expect(() => docxHeaders('application/pdf', 'x.docx', '"1"', 'bad')).toThrow();
    expect(() =>
      docxHeaders(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '../x.docx',
        '"1"',
        '00000000-0000-4000-8000-000000000000',
      ),
    ).toThrow();
  });
  it('rejects renamed bytes and enforces the streaming cap', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'docx-test-'));
    try {
      await expect(receiveDocx(Readable.from(['not zip']), join(dir, 'a'), 100)).rejects.toThrow();
      await expect(
        receiveDocx(Readable.from([Buffer.alloc(101)]), join(dir, 'b'), 100),
      ).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
