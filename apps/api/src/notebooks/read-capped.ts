import type { Readable } from 'node:stream';

/**
 * Reads a body of at most `max` bytes. A larger one is read to its end and dropped (up to four
 * times the limit, then the connection is cut), so the client receives the 413 instead of a reset.
 */
export async function readCapped(req: Readable, max: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > max * 4) {
      req.destroy();
      return null;
    }
    if (size <= max) chunks.push(chunk);
  }
  return size > max ? null : Buffer.concat(chunks);
}
