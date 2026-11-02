import { BadRequestException } from '@nestjs/common';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { MAX_IMAGE_BYTES } from './image-encode';

/**
 * CANVAS-01: the API fetches an image the user dragged in from another site (Google Images hands
 * the page a URL, rarely the file). This is a server-side request to a user-chosen URL, so:
 *
 * - only http/https on the default ports, no credentials in the URL;
 * - every address the name resolves to must be public, and the socket connects to that checked
 *   address (the `lookup` hook), so a DNS answer cannot change between check and connect;
 * - redirects are followed by hand, at most three, each one checked again;
 * - no cookies or user headers are sent; the body is capped at 10 MB and 10 seconds.
 */
const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const)
  blocked.addSubnet(network, prefix, 'ipv6');

/**
 * An IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) as its IPv4 address. Node's BlockList would
 * match every IPv4 against a `::ffff:0:0/96` rule, so mapped addresses are unwrapped instead.
 */
function mappedIpv4(address: string) {
  let normal: string;
  try {
    normal = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normal);
  if (!match) return null;
  const high = parseInt(match[1], 16),
    low = parseInt(match[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

/** Loopback, private, link-local (cloud metadata), CGNAT, multicast, documentation, NAT64… */
export function isBlockedAddress(address: string, family: 4 | 6) {
  if (family === 6) {
    const v4 = mappedIpv4(address);
    if (v4) return blocked.check(v4, 'ipv4');
  }
  return blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

export class ImageFetchError extends BadRequestException {
  constructor(code: 'IMAGE_URL_INVALID' | 'IMAGE_URL_BLOCKED' | 'IMAGE_FETCH_FAILED') {
    super({
      code,
      message:
        code === 'IMAGE_URL_INVALID'
          ? 'Đường dẫn ảnh không hợp lệ.'
          : code === 'IMAGE_URL_BLOCKED'
            ? 'Không tải ảnh từ địa chỉ này được.'
            : 'Không lấy được ảnh từ trang này. Hãy lưu ảnh về máy rồi kéo vào.',
    });
  }
}

export interface FetchImageOptions {
  /** Tests point this at a fake resolver; production uses the system resolver. */
  lookup?: typeof dnsLookup;
  /** Tests may allow loopback servers; production blocks everything above. */
  isBlocked?: (address: string, family: 4 | 6) => boolean;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Ports a URL may name; tests add their ephemeral server port. */
  ports?: readonly string[];
}
const DEFAULT_PORTS = ['', '80', '443'] as const;

export function parseImageUrl(raw: string, ports: readonly string[] = DEFAULT_PORTS): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImageFetchError('IMAGE_URL_INVALID');
  }
  if (
    raw.length > 2048 ||
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    !ports.includes(url.port) ||
    !url.hostname
  )
    throw new ImageFetchError('IMAGE_URL_INVALID');
  return url;
}

type Lookup = (
  hostname: string,
  options: { all?: boolean; family?: number },
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
) => void;

function guardedLookup(resolve: typeof dnsLookup, isBlocked: FetchImageOptions['isBlocked']) {
  const check = isBlocked ?? isBlockedAddress;
  const lookup: Lookup = (hostname, options, callback) => {
    resolve(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) return callback(error, '');
      const list = addresses;
      // Every answer must be public: a mixed answer could be steered to the private one.
      if (!list.length || list.some((a) => check(a.address, a.family === 6 ? 6 : 4)))
        return callback(Object.assign(new Error('Blocked address.'), { code: 'EBLOCKED' }), '');
      const wanted = options.family ? list.filter((a) => a.family === options.family) : list;
      if (!wanted.length)
        return callback(Object.assign(new Error('No address.'), { code: 'ENOTFOUND' }), '');
      if (options.all) callback(null, wanted);
      else callback(null, wanted[0].address, wanted[0].family);
    });
  };
  return lookup;
}

function once(
  url: URL,
  options: Required<Omit<FetchImageOptions, 'lookup' | 'isBlocked' | 'ports'>> & {
    lookup: Lookup;
    signal: AbortSignal;
  },
) {
  return new Promise<{ redirect: string } | { bytes: Buffer }>((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = send(
      url,
      {
        method: 'GET',
        lookup: options.lookup as never,
        signal: options.signal,
        headers: {
          'User-Agent': 'HUCEScholar-ImageFetch/1.0',
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1',
        },
        agent: false,
      },
      (response: IncomingMessage) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          return resolve({ redirect: response.headers.location });
        }
        if (status !== 200) {
          response.resume();
          return reject(new ImageFetchError('IMAGE_FETCH_FAILED'));
        }
        const declared = Number(response.headers['content-length']);
        if (Number.isFinite(declared) && declared > options.maxBytes) {
          response.destroy();
          return reject(new ImageFetchError('IMAGE_FETCH_FAILED'));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            response.destroy();
            reject(new ImageFetchError('IMAGE_FETCH_FAILED'));
          } else chunks.push(chunk);
        });
        response.on('end', () => resolve({ bytes: Buffer.concat(chunks) }));
        response.on('error', () => reject(new ImageFetchError('IMAGE_FETCH_FAILED')));
      },
    );
    request.on('error', (error: NodeJS.ErrnoException) =>
      reject(
        new ImageFetchError(error.code === 'EBLOCKED' ? 'IMAGE_URL_BLOCKED' : 'IMAGE_FETCH_FAILED'),
      ),
    );
    request.end();
  });
}

/** Fetches the image bytes; returns them with the final host (kept as "Ảnh từ <host>"). */
export async function fetchImage(raw: string, options: FetchImageOptions = {}) {
  const isBlocked = options.isBlocked ?? isBlockedAddress;
  const settings = {
    maxBytes: options.maxBytes ?? MAX_IMAGE_BYTES,
    timeoutMs: options.timeoutMs ?? 10_000,
    maxRedirects: options.maxRedirects ?? 3,
    lookup: guardedLookup(options.lookup ?? dnsLookup, isBlocked),
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
  };
  const ports = options.ports ?? DEFAULT_PORTS;
  let url = parseImageUrl(raw, ports);
  for (let hop = 0; ; hop++) {
    // A literal address skips DNS, so it is checked here instead of in the lookup hook.
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const family = isIP(host);
    if (family && isBlocked(host, family === 6 ? 6 : 4))
      throw new ImageFetchError('IMAGE_URL_BLOCKED');
    const result = await once(url, settings);
    if ('bytes' in result) return { bytes: result.bytes, host: url.hostname.slice(0, 253) };
    if (hop >= settings.maxRedirects) throw new ImageFetchError('IMAGE_FETCH_FAILED');
    let next: URL;
    try {
      next = new URL(result.redirect, url);
    } catch {
      throw new ImageFetchError('IMAGE_FETCH_FAILED');
    }
    url = parseImageUrl(next.toString(), ports);
  }
}
