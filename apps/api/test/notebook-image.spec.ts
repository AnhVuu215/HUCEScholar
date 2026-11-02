import { HttpException } from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { encodeImage, sniffImage } from '../src/notebooks/image-encode';
import { fetchImage, isBlockedAddress, parseImageUrl } from '../src/notebooks/image-fetch';
import { fetchBlocker } from '../src/notebooks/notebook-assets.service';

/** A PNG with only a header (and an empty image stream) declaring the given size. */
function pngHeader(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(0))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return ((error as HttpException).getResponse() as { code: string }).code;
  }
  throw new Error('Expected a rejection.');
};

describe('CANVAS-01 image re-encoding', () => {
  it('recognises formats by magic bytes only', async () => {
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    expect(sniffImage(png)).toBe('png');
    expect(sniffImage(Buffer.from('GIF89a......'))).toBe('gif');
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    const heic = Buffer.alloc(24);
    heic.writeUInt32BE(24, 0);
    heic.write('ftypheic', 4, 'latin1');
    heic.write('mif1heic', 16, 'latin1');
    expect(sniffImage(heic)).toBe('heic');
  });

  it('writes a fresh WebP, shrinks large images and drops EXIF', async () => {
    const jpeg = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: '#00aa00' },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'secret-gps-tag' } })
      .toBuffer();
    expect(jpeg.includes(Buffer.from('secret-gps-tag'))).toBe(true);
    const image = await encodeImage(jpeg);
    expect(image.data.subarray(8, 12).toString('latin1')).toBe('WEBP');
    expect([image.width, image.height]).toEqual([2400, 1200]);
    expect(image.data.includes(Buffer.from('secret-gps-tag'))).toBe(false);
    const meta = await sharp(image.thumb).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(480);
    expect(image.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('applies the EXIF orientation before dropping it', async () => {
    const rotated = await sharp({
      create: { width: 200, height: 100, channels: 3, background: '#0000ff' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const image = await encodeImage(rotated);
    expect([image.width, image.height]).toEqual([100, 200]);
  });

  it('refuses SVG, HEIC, corrupt files and pixel bombs', async () => {
    expect(await code(encodeImage(Buffer.from('<svg onload="alert(1)"></svg>')))).toBe(
      'IMAGE_UNSUPPORTED',
    );
    const heic = Buffer.alloc(24);
    heic.writeUInt32BE(24, 0);
    heic.write('ftypheic', 4, 'latin1');
    expect(await code(encodeImage(heic))).toBe('IMAGE_HEIC');
    const broken = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64, 7),
    ]);
    expect(await code(encodeImage(broken))).toBe('IMAGE_INVALID');
    // A tiny PNG whose header claims 20 000 × 20 000 pixels is refused before decoding.
    expect(await code(encodeImage(pngHeader(20_000, 20_000)))).toBe('IMAGE_TOO_LARGE');
  });
});

describe('CANVAS-01 image fetching (SSRF guard)', () => {
  it.each([
    ['127.0.0.1', 4],
    ['10.1.2.3', 4],
    ['172.20.0.1', 4],
    ['192.168.1.1', 4],
    ['169.254.169.254', 4],
    ['100.64.0.1', 4],
    ['0.0.0.0', 4],
    ['224.0.0.1', 4],
    ['::1', 6],
    ['fd00::1', 6],
    ['fe80::1', 6],
    ['::ffff:127.0.0.1', 6],
    ['64:ff9b::a9fe:a9fe', 6],
  ] as const)('blocks %s', (address, family) => {
    expect(isBlockedAddress(address, family)).toBe(true);
  });
  it('allows public addresses', () => {
    expect(isBlockedAddress('142.250.72.14', 4)).toBe(false);
    expect(isBlockedAddress('2607:f8b0:4005:80a::200e', 6)).toBe(false);
    expect(isBlockedAddress('::ffff:142.250.72.14', 6)).toBe(false);
    expect(isBlockedAddress('::ffff:7f00:1', 6)).toBe(true);
  });
  it('allows loopback only for opted-in test runs', () => {
    expect(fetchBlocker({ NODE_ENV: 'test', NOTEBOOK_FETCH_LOOPBACK: '1' })('127.0.0.1', 4)).toBe(
      false,
    );
    expect(fetchBlocker({ NODE_ENV: 'test', NOTEBOOK_FETCH_LOOPBACK: '1' })('10.0.0.1', 4)).toBe(
      true,
    );
    expect(
      fetchBlocker({ NODE_ENV: 'production', NOTEBOOK_FETCH_LOOPBACK: '1' })('127.0.0.1', 4),
    ).toBe(true);
  });
  it.each([
    'file:///etc/passwd',
    'ftp://example.com/a.png',
    'http://user:pw@example.com/a.png',
    'http://example.com:8080/a.png',
    'javascript:alert(1)',
    'not a url',
  ])('rejects %s', (url) => {
    expect(() => parseImageUrl(url)).toThrow();
  });

  describe('against a local server', () => {
    let server: Server;
    let base: string;
    let png: Buffer;
    beforeAll(async () => {
      png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123456' } })
        .png()
        .toBuffer();
      server = createServer((req, res) => {
        if (req.url === '/a.png') {
          res.writeHead(200, { 'Content-Type': 'image/png' });
          res.end(png);
        } else if (req.url === '/hop') {
          res.writeHead(302, { Location: '/a.png' });
          res.end();
        } else if (req.url === '/loop') {
          res.writeHead(302, { Location: '/loop' });
          res.end();
        } else if (req.url === '/metadata') {
          res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' });
          res.end();
        } else if (req.url === '/big') {
          res.writeHead(200);
          res.end(Buffer.alloc(2048));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      // Port 80 only in production; the test fetcher is pointed at the ephemeral port by name.
      base = `http://localhost:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise((resolve) => server.close(resolve)));
    // "img.test" resolves to the local server; only the tests' own loopback is allowed.
    const resolver = ((
      _host: string,
      _options: unknown,
      callback: (e: null, a: { address: string; family: number }[]) => void,
    ) => callback(null, [{ address: '127.0.0.1', family: 4 }])) as never;
    const allowLoopback = (address: string, family: 4 | 6) =>
      address === '127.0.0.1' ? false : isBlockedAddress(address, family);
    const options = () => ({
      lookup: resolver,
      isBlocked: allowLoopback,
      ports: ['', '80', '443', new URL(base).port],
      timeoutMs: 5000,
    });
    const at = (path: string) => `http://img.test:${new URL(base).port}${path}`;

    it('fetches an image and reports the host', async () => {
      const result = await fetchImage(at('/a.png'), options());
      expect(result.bytes.equals(png)).toBe(true);
      expect(result.host).toBe('img.test');
    });
    it('follows a redirect, but at most three', async () => {
      expect((await fetchImage(at('/hop'), options())).bytes.equals(png)).toBe(true);
      expect(await code(fetchImage(at('/loop'), options()))).toBe('IMAGE_FETCH_FAILED');
    });
    it('checks the redirect target again', async () => {
      expect(await code(fetchImage(at('/metadata'), options()))).toBe('IMAGE_URL_BLOCKED');
    });
    it('caps the size and needs a 200 answer', async () => {
      expect(await code(fetchImage(at('/big'), { ...options(), maxBytes: 1024 }))).toBe(
        'IMAGE_FETCH_FAILED',
      );
      expect(await code(fetchImage(at('/missing'), options()))).toBe('IMAGE_FETCH_FAILED');
    });
    it('refuses a name that resolves to a blocked address', async () => {
      expect(
        await code(fetchImage(at('/a.png'), { ...options(), isBlocked: isBlockedAddress })),
      ).toBe('IMAGE_URL_BLOCKED');
    });
    it('blocks loopback through DNS and literal addresses by default', async () => {
      expect(await code(fetchImage('http://localhost/a.png', { timeoutMs: 3000 }))).toBe(
        'IMAGE_URL_BLOCKED',
      );
      expect(await code(fetchImage('http://127.0.0.1/a.png'))).toBe('IMAGE_URL_BLOCKED');
      expect(await code(fetchImage('http://[::1]/a.png'))).toBe('IMAGE_URL_BLOCKED');
      expect(await code(fetchImage('http://169.254.169.254/latest'))).toBe('IMAGE_URL_BLOCKED');
    });
  });
});
