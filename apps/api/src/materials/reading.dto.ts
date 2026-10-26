import { trim } from '../dto-transforms';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
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
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
export class NotesQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d{1,9}$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(2147483647)
  pageNumber!: number;
  @IsOptional() @Matches(/^[1-9]\d{0,18}$/) cursor?: string;
}
/** READ-04: where a page note is pinned, normalized 0..1 on the unrotated page, y upward. */
export interface NotePosition {
  x: number;
  y: number;
}
@ValidatorConstraint({ name: 'notePosition', async: false })
export class NotePositionValidator implements ValidatorConstraintInterface {
  validate(value: unknown): value is NotePosition {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const p = value as Record<string, unknown>;
    return (
      Object.keys(p).sort().join(',') === 'x,y' &&
      [p.x, p.y].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)
    );
  }
  defaultMessage() {
    return 'Vị trí ghim phải nằm trong trang PDF.';
  }
}
export class CreateNoteDto {
  @IsInt() @Min(1) @Max(2147483647) pageNumber!: number;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) content!: string;
  @IsUUID('4') requestId!: string;
  /** Omitted: a panel-only note. */
  @IsOptional() @Validate(NotePositionValidator) position?: NotePosition;
}
export class ReadingRevisionDto {
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
export class UpdateNoteDto extends ReadingRevisionDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) content!: string;
  /** Omitted: keep the pin. `null`: take the note off the page. */
  @IsOptional() @Validate(NotePositionValidator) position?: NotePosition | null;
}
export class SaveProgressDto {
  @IsInt() @Min(1) @Max(2147483647) pageNumber!: number;
  @IsInt() @Min(0) @Max(2147483646) revision!: number;
}
export class ReviewLaterDto {
  @IsBoolean() reviewLater!: boolean;
}
export class ExportNotesDto {
  @IsIn(['markdown', 'text']) format: 'markdown' | 'text' = 'markdown';
}
