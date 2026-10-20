import 'reflect-metadata';
import { validate } from 'class-validator';
import { ChangePasswordDto } from '../src/auth/change-password.dto';
it.each([
  ['a'.repeat(15), false],
  ['a'.repeat(16), true],
  ['🙂'.repeat(15), false],
  ['🙂'.repeat(64), true],
  ['🙂'.repeat(65), false],
  [' '.repeat(16), true],
])('validates password code points and UTF-16 independently, case %#', async (value, valid) => {
  const dto = Object.assign(new ChangePasswordDto(), {
    currentPassword: 'current',
    newPassword: value,
  });
  expect((await validate(dto)).length === 0).toBe(valid);
});
