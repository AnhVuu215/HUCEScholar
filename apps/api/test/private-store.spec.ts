import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileConfiguration, type FileConfiguration } from '../src/files/files.config';
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
  it('reports whether a notebook image is still stored', async () => {
    const image = 'notebook/00000000-0000-4000-8000-000000000001.webp';
    await expect(store.imageExists(image)).resolves.toBe(false);
    await store.putImage(image, Buffer.from('webp'));
    await expect(store.imageExists(image)).resolves.toBe(true);
  });
  it('fails readiness when uploads cannot be staged, even in S3 mode', async () => {
    // A file where the root should be: S3 mode stages under it, so the bucket alone is not enough.
    const blocked = join(root, 'not-a-directory');
    await writeFile(blocked, 'x');
    const s3 = new PrivateStore(
      fileConfiguration({
        FILE_LOCAL_ROOT: blocked,
        FILE_STORAGE: 's3',
        S3_BUCKET: 'private-test',
        AWS_REGION: 'garage',
        // Refused at once if the probe ever reached the network instead of stopping at the root.
        S3_ENDPOINT: 'http://127.0.0.1:1',
      }),
    );
    await expect(s3.reachable(AbortSignal.timeout(2000))).rejects.toMatchObject({
      code: expect.stringMatching(/^(EEXIST|ENOTDIR)$/),
    });
    s3.onModuleDestroy();
  });
});
