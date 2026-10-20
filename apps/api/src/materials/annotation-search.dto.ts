import { Transform } from 'class-transformer';
import { IsInt, IsIn, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { highlightColors } from './highlight.dto';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export class AnnotationSearchDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsIn(['PAGE_NOTE', 'TEXT_HIGHLIGHT'])
  kind?: 'PAGE_NOTE' | 'TEXT_HIGHLIGHT';
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsIn(highlightColors)
  color?: string;
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
