import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FileConfiguration } from '../src/files/files.config';
import { MissingObjectError, PrivateStore } from '../src/files/private-store';

const key = 'quarantine/0b6f2c1e-4a5d-4c8e-9f3a-1d2e3f4a5b6c.pdf';

describe('private store, local driver', () => {
  let root: string;
  let store: PrivateStore;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'hs-store-'));
    store = new PrivateStore({ driver: 'local', root } as FileConfiguration);
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  it('tells a missing object apart from other failures', async () => {
    await expect(store.read(key)).rejects.toBeInstanceOf(MissingObjectError);
    await expect(store.exists(key)).resolves.toBe(false);
    // An invalid key is a programming error, not a missing object.
    await expect(store.read('../etc/passwd')).rejects.not.toBeInstanceOf(MissingObjectError);
  });
  it('reads an object that is there', async () => {
    await mkdir(join(root, 'quarantine'), { recursive: true });
    await writeFile(join(root, key), '%PDF-1.4');
    await expect(store.exists(key)).resolves.toBe(true);
    const chunks: Buffer[] = [];
    for await (const chunk of await store.read(key, { start: 0, end: 3 })) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe('%PDF');
  });
});
