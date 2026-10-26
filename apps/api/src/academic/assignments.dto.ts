import { trim, integer } from '../dto-transforms';
import { Transform } from 'class-transformer';
import {
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
export class OwnAssignmentsDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'REVOKED']) status?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,18}$/) courseId?: string;
  @Transform(integer) @IsInt() @Min(1) @Max(100000) page = 1;
  @Transform(integer) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class ListAssignmentsDto extends OwnAssignmentsDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,18}$/) lecturerId?: string;
}
export class CreateAssignmentDto {
  @IsString() @Matches(/^[1-9]\d{0,18}$/) courseId!: string;
  @IsString() @Matches(/^[1-9]\d{0,18}$/) lecturerId!: string;
}
export class RevokeAssignmentDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
