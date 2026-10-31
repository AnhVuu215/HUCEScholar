import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { DraftListDto } from './materials.dto';
export class PersonalListDto extends DraftListDto {
  override limit = 12;
}
/** CAL-04: the calendar's "Cần xem lại" list, optionally one course or one version. */
export class ReviewLaterListDto extends PersonalListDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,18}$/) courseId?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,18}$/) versionId?: string;
}
export class SaveDocumentDto {
  @IsIn([true]) saved!: boolean;
}
