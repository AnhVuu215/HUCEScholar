import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform as Convert } from 'class-transformer';
import { DraftListDto, SubmitMaterialDto } from './materials.dto';

export class ModerationListDto extends DraftListDto {
  @IsOptional()
  @IsIn(['PENDING', 'WITHDRAWN', 'APPROVED', 'CHANGES_REQUIRED', 'REJECTED'])
  status?: string;
  @IsOptional() @IsIn(['LECTURER_MATERIAL', 'STUDENT_SUPPLEMENT']) kind?: string;
}
export class ModerationDecisionDto extends SubmitMaterialDto {
  @IsInt() @Min(1) @Max(2147483646) submittedRevision!: number;
  @IsIn(['APPROVED', 'CHANGES_REQUIRED', 'REJECTED']) outcome!: string;
  @Convert(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
  @IsOptional() @IsBoolean() rightsConfirmed?: boolean;
}
