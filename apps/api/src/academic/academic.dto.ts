import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const code = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const integer = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : value;
export class CatalogFieldsDto {
  @Transform(code) @IsString() @MaxLength(30) @Matches(/^[A-Z0-9][A-Z0-9._-]*$/) code!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name!: string;
}
export class CreateCatalogDto extends CatalogFieldsDto {}
export class UpdateCatalogDto extends CatalogFieldsDto {
  @IsBoolean() active!: boolean;
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
export class ListCatalogDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @Transform(integer) @IsInt() @Min(1) @Max(100000) page = 1;
  @Transform(integer) @IsInt() @Min(1) @Max(100) limit = 20;
}
