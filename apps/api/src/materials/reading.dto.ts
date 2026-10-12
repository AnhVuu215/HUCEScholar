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
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
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
export class CreateNoteDto {
  @IsInt() @Min(1) @Max(2147483647) pageNumber!: number;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) content!: string;
  @IsUUID('4') requestId!: string;
}
export class ReadingRevisionDto {
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
export class UpdateNoteDto extends ReadingRevisionDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) content!: string;
}
export class SaveProgressDto {
  @IsInt() @Min(1) @Max(2147483647) pageNumber!: number;
  @IsInt() @Min(0) @Max(2147483646) revision!: number;
}
