import { ForbiddenException } from '@nestjs/common';
import type { Role } from '../auth/auth.types';
import type { Prisma } from '../generated/prisma/client';

/**
 * Re-checks the signed-in account inside the write: it must still be active and verified, and
 * hold `role` when one is given. The row stays locked FOR SHARE until the transaction ends, so a
 * lock or role change made meanwhile waits for this write instead of racing it.
 */
export async function requireActiveUser(
  tx: Prisma.TransactionClient,
  id: bigint,
  denied: string,
  role?: Role,
) {
  await tx.$queryRaw`SELECT id FROM hucescholar.users WHERE id=${id} FOR SHARE`;
  const user = await tx.users.findUnique({ where: { id } });
  if (!user || user.status !== 'ACTIVE' || !user.verified_at || (role && user.role !== role))
    throw new ForbiddenException(denied);
  return user;
}
