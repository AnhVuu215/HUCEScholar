import { trim } from '../dto-transforms';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { highlightColors } from './highlight.dto';
export class AnnotationSearchDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsIn(['PAGE_NOTE', 'TEXT_HIGHLIGHT'])
  kind?: 'PAGE_NOTE' | 'TEXT_HIGHLIGHT';
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsIn(highlightColors)
  color?: string;
  /** Only items the owner marked "Cần xem lại"; false is the same as leaving it out. */
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  reviewLater?: boolean;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  query?: string;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  @MaxLength(256)
  cursor?: string;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
/** LEARN-03: the same filters across every readable document, optionally one course. */
export class NotebookSearchDto extends AnnotationSearchDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  courseId?: string;
}
/** EXPORT-02: the notebook's filters (paging fields are ignored) and a file format. */
export class NotebookExportDto extends NotebookSearchDto {
  @IsIn(['markdown', 'text']) format: 'markdown' | 'text' = 'markdown';
}
