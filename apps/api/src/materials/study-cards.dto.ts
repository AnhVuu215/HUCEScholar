import { trim, integer } from '../dto-transforms';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class StudyCardFieldsDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) question!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) answer!: string;
}
export class CreateStudyCardDto extends StudyCardFieldsDto {
  @IsString() @Matches(/^[1-9]\d{0,18}$/) annotationId!: string;
  @IsUUID('4') requestId!: string;
}
export class UpdateStudyCardDto extends StudyCardFieldsDto {
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
export class StudyCardRevisionDto {
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
/** STUDY-02: which cards a list or a practice round covers; both filters may be combined. */
export class StudyCardScopeDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,18}$/) versionId?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,18}$/) courseId?: string;
}
/** STUDY-03: an answer in a scheduled review; requestId makes a retry harmless. */
export class ReviewStudyCardDto {
  @IsIn(['KNOWN', 'AGAIN']) result!: 'KNOWN' | 'AGAIN';
  @IsUUID('4') requestId!: string;
}
/** STUDY-03: how many cards fall due each day between two dates, for the deck and the calendar. */
export class StudyScheduleDto extends StudyCardScopeDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}
export class StudyCardListDto extends StudyCardScopeDto {
  @Transform(integer) @IsInt() @Min(1) @Max(100000) page = 1;
  @Transform(integer) @IsInt() @Min(1) @Max(50) limit = 20;
}
