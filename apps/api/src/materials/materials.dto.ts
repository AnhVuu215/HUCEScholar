import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
const integer = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : value;
export class DraftFieldsDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(300) title!: string;
  @Transform(trim) @IsString() @MaxLength(500) authors!: string;
  @Transform(trim) @IsString() @MaxLength(1500) description!: string;
  @IsIn(['TEXTBOOK', 'LECTURE', 'EXERCISE', 'EXAM', 'REFERENCE', 'OTHER']) materialType!: string;
  @Transform(trim) @IsString() @MaxLength(1000) sourceReference = '';
  @Transform(trim) @IsString() @MaxLength(1000) rightsBasis = '';
  @IsBoolean() downloadAllowed!: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[1-9]\d{0,18}$/, { each: true })
  courseIds!: string[];
}
export class UpdateDraftDto extends DraftFieldsDto {
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
export class DraftListDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) search?: string;
  @Transform(integer) @IsInt() @Min(1) @Max(100000) page = 1;
  @Transform(integer) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class MaterialListDto extends DraftListDto {
  @IsOptional()
  @IsIn(['DRAFT', 'SUBMITTED', 'CHANGES_REQUIRED', 'APPROVED', 'REJECTED'])
  reviewStatus?: string;
}
export class MaterialHistoryDto extends DraftListDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,18}$/) versionId?: string;
}
export class SubmitMaterialDto {
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
export class WithdrawMaterialDto extends SubmitMaterialDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
