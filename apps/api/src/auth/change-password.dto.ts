import { IsString, MinLength, ValidateBy } from 'class-validator';
const utf16Bound = () =>
  ValidateBy({
    name: 'utf16Bound',
    validator: {
      validate: (value: unknown) => typeof value === 'string' && value.length <= 128,
      defaultMessage: () => 'Mật khẩu không được vượt quá128 đơn vị UTF-16.',
    },
  });
export class ChangePasswordDto {
  @IsString() @MinLength(1) @utf16Bound() currentPassword!: string;
  @IsString() @MinLength(16) @utf16Bound() newPassword!: string;
}
