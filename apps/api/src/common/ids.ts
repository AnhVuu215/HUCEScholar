import { BadRequestException } from '@nestjs/common';

/**
 * A database id from a URL or body: a positive bigint in decimal, without leading zeros, that
 * fits PostgreSQL `bigint`. Anything else is a 400, never a lookup.
 */
export function parseId(value: string): bigint {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n)
    throw new BadRequestException('Mã định danh không hợp lệ.');
  return BigInt(value);
}
