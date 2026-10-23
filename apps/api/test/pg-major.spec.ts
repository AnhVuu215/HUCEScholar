import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Prisma 7.10's query interpreter runs the child queries of an `include` with several relations
 * concurrently; inside an interactive transaction they share one pg client. pg 8 queues them
 * (correct, with a DeprecationWarning); pg 9 will reject them. Upgrading pg needs Prisma to
 * serialise those queries first — see docs/superpowers/plans/2026-10-23-dev-audit-fixes.md, step 6.
 */
it('keeps node-postgres on major 8 until Prisma stops sharing a transaction client', () => {
  const pg = JSON.parse(
    readFileSync(join(require.resolve('pg'), '..', '..', 'package.json'), 'utf8'),
  ) as { version: string };
  expect(Number(pg.version.split('.')[0])).toBe(8);
});
