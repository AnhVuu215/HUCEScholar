import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { AnnotationSearchDto } from './annotation-search.dto';

/**
 * The owner-chosen filters of a notebook search (LEARN-01/02/03) as an SQL fragment of `AND …`
 * conditions on `hucescholar.annotations`, plus a fingerprint that binds cursors to them.
 * `extra` adds caller-specific filters (such as a course) to the fingerprint.
 */
export function annotationFilter(query: AnnotationSearchDto, extra: unknown[] = []) {
  if (query.kind === 'PAGE_NOTE' && query.color)
    throw new BadRequestException('Màu chỉ áp dụng cho đoạn tô.');
  const kind = query.color ? 'TEXT_HIGHLIGHT' : query.kind;
  const term = query.query ?? '';
  const reviewLater = query.reviewLater === true;
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([kind ?? null, query.color ?? null, term, reviewLater, ...extra]))
    .digest('base64url');
  // Treat SQL wildcard characters as literal text, including the escape character itself.
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  const sql = Prisma.sql`
    ${kind ? Prisma.sql`AND kind = ${kind}` : Prisma.empty}
    ${query.color ? Prisma.sql`AND color = ${query.color}` : Prisma.empty}
    ${reviewLater ? Prisma.sql`AND review_later` : Prisma.empty}
    ${term ? Prisma.sql`AND (content ILIKE ${pattern} ESCAPE ${'\\'} OR anchor->>'quote' ILIKE ${pattern} ESCAPE ${'\\'})` : Prisma.empty}
  `;
  return { sql, fingerprint };
}

/** An opaque "load more" cursor: a fixed head, the last row's position, then the fingerprint. */
export function encodeCursor(head: unknown[], position: unknown[], fingerprint: string) {
  return Buffer.from(JSON.stringify([...head, ...position, fingerprint])).toString('base64url');
}

/**
 * Reads a cursor made by `encodeCursor` with the same head, a `size`-long position and the same
 * fingerprint. `parse` checks the position and returns null (or throws) to reject it. Every
 * failure is the same 400, so a cursor never tells the caller why someone else's or a stale one
 * was refused.
 */
export function decodeCursor<T>(
  cursor: string,
  head: unknown[],
  size: number,
  fingerprint: string,
  parse: (position: unknown[]) => T | null,
): T {
  try {
    const decoded = Buffer.from(cursor, 'base64url');
    const tuple: unknown = JSON.parse(decoded.toString('utf8'));
    if (
      decoded.toString('base64url') !== cursor ||
      !Array.isArray(tuple) ||
      tuple.length !== head.length + size + 1 ||
      !head.every((value, index) => tuple[index] === value) ||
      tuple.at(-1) !== fingerprint
    )
      throw new Error('Invalid cursor');
    const position = parse(tuple.slice(head.length, -1));
    if (position === null) throw new Error('Invalid cursor');
    return position;
  } catch {
    throw new BadRequestException('Lượt tải tiếp không hợp lệ. Tìm lại từ đầu.');
  }
}
