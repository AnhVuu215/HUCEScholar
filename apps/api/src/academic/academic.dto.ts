import { trim, integer } from '../dto-transforms';
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
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';

const code = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
export class CatalogFieldsDto {
  @Transform(code) @IsString() @MaxLength(30) @Matches(/^[A-Z0-9][A-Z0-9._-]*$/) code!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name!: string;
}
export class CreateCatalogDto extends CatalogFieldsDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,18}$/) facultyId?: string;
}
export class UpdateCatalogDto extends CatalogFieldsDto {
  @IsBoolean() active!: boolean;
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
export class CourseProgramsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[1-9]\d{0,18}$/, { each: true })
  programIds!: string[];
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
export class ListCatalogDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,18}$/) facultyId?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @Transform(integer) @IsInt() @Min(1) @Max(100000) page = 1;
  @Transform(integer) @IsInt() @Min(1) @Max(100) limit = 20;
}
