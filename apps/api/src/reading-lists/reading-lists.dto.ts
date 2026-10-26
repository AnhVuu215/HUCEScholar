import { trim } from '../dto-transforms';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const MAX_READING_ITEMS = 100;
export class ReadingItemDto {
  @Transform(trim) @IsString() @MaxLength(120) section!: string;
  @IsString() @Matches(/^[1-9]\d{0,18}$/) versionId!: string;
  @Transform(trim) @IsString() @MaxLength(500) note!: string;
}
export class SaveReadingListDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsBoolean() published!: boolean;
  /** 0 creates the list; otherwise the revision the editor loaded. */
  @IsInt() @Min(0) @Max(2147483646) revision!: number;
  @IsArray()
  @ArrayMaxSize(MAX_READING_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ReadingItemDto)
  items!: ReadingItemDto[];
}
