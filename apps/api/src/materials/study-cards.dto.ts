import { trim, integer } from '../dto-transforms';
import { Transform } from 'class-transformer';
import {
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
export class StudyCardListDto {
  @Transform(integer) @IsInt() @Min(1) @Max(100000) page = 1;
  @Transform(integer) @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,18}$/) versionId?: string;
}
