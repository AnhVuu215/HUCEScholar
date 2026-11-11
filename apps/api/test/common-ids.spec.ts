import { BadRequestException } from '@nestjs/common';
import { parseId } from '../src/common/ids';

describe('parseId', () => {
  it('reads a positive bigint id', () => {
    expect(parseId('1')).toBe(1n);
    expect(parseId('9223372036854775807')).toBe(9223372036854775807n);
  });
  it.each(['', '0', '01', '-1', '1.5', '1e3', ' 1', 'abc', '9223372036854775808'])(
    'rejects %p before any lookup',
    (value) => expect(() => parseId(value)).toThrow(BadRequestException),
  );
});
