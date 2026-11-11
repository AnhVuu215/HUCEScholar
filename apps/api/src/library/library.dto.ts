import { IsIn, IsOptional, Matches } from 'class-validator';
import { DraftListDto } from '../drafts/materials.dto';
export class LibraryListDto extends DraftListDto {
  @IsOptional()
  @IsIn(['TEXTBOOK', 'LECTURE', 'EXERCISE', 'EXAM', 'REFERENCE', 'OTHER'])
  materialType?: string;
  @IsOptional() @Matches(/^[1-9]\d{0,18}$/) courseId?: string;
}
