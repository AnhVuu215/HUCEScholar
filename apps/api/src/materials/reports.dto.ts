import { Transform } from 'class-transformer';
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
import { DraftListDto } from './materials.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const reportCategories = [
  'FILE_ERROR',
  'WRONG_COURSE',
  'RIGHTS',
  'CONTENT',
  'BROKEN_LINK',
  'OTHER',
] as const;
export const reportStatuses = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'] as const;

export class CreateReportDto {
  @IsIn(reportCategories) category!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) description!: string;
}
export class ReportListDto extends DraftListDto {
  @IsOptional() @IsIn(reportStatuses) status?: string;
}
export class ReportActionDto {
  @IsIn(['TAKE_REVIEW', 'RESOLVE', 'DISMISS']) action!: string;
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
  /** Shown to the reporter; required to resolve or dismiss. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) result?: string;
  /** Only with RESOLVE: hide the whole document through the lifecycle rules. */
  @IsOptional() @IsBoolean() hide?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(2147483646) documentRevision?: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) hideReason?: string;
}
