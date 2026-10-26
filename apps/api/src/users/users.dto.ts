import { trim } from '../dto-transforms';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const email = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const queryInteger = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : value;

export class UserFieldsDto {
  @Transform(email) @IsEmail() @MaxLength(254) email!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(150) displayName!: string;
}
export class CreateUserDto extends UserFieldsDto {
  @IsIn(['LECTURER', 'STUDENT']) role!: 'LECTURER' | 'STUDENT';
  @IsString() @MinLength(16) @MaxLength(128) password!: string;
  @Equals(true) eligibilityConfirmed!: boolean;
}
export class UpdateUserDto extends UserFieldsDto {
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
export class ResetPasswordDto {
  @IsString() @MinLength(16) @MaxLength(128) password!: string;
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
export class UserStatusDto {
  @IsIn(['ACTIVE', 'LOCKED']) status!: 'ACTIVE' | 'LOCKED';
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
  @IsOptional() @Equals(true) eligibilityConfirmed?: boolean;
}
export class ListUsersDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(254) search?: string;
  @IsOptional() @IsIn(['ADMIN', 'LECTURER', 'STUDENT']) role?: string;
  @IsOptional() @IsIn(['PENDING', 'ACTIVE', 'LOCKED']) status?: string;
  @Transform(queryInteger) @IsInt() @Min(1) @Max(100000) page = 1;
  @Transform(queryInteger) @IsInt() @Min(1) @Max(100) limit = 20;
}
