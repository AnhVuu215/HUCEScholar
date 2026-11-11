import type { Prisma } from '../generated/prisma/client';

/**
 * Transaction-scoped PostgreSQL advisory locks. Each is released when its transaction ends, so a
 * lock never outlives the write it protects.
 */
type Tx = Prisma.TransactionClient;

/** Any catalog change and every write that checks course state (drafts, moderation, hiding). */
const CATALOG_LOCK = [68467, 1] as const;

/** Serializes the writes above, so a course cannot be stopped halfway through a decision. */
export const lockCatalog = (tx: Tx) =>
  tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${CATALOG_LOCK[0]}::int, ${CATALOG_LOCK[1]}::int)`;

/**
 * One lock per named key, e.g. `reading:<userId>` for everything a reader writes or
 * `reading-list:<courseId>` for one course's list. Keys share the `hucescholar:` prefix.
 */
export const lockKey = (tx: Tx, key: string) =>
  tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`hucescholar:${key}`}, 0))`;
