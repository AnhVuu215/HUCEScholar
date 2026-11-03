import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { trim } from '../dto-transforms';
import { COVERS, PAGE_SIZES, PAPER_COLORS, PAPERS } from './notebook-content';

const ID = /^[1-9]\d{0,18}$/;

export class NotebookListDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) q?: string;
  @IsOptional() @Matches(ID) courseId?: string;
  @IsOptional() @IsIn(['1']) trash?: '1';
}
/** Page defaults a notebook gives new pages. */
class NotebookDefaultsDto {
  @IsIn(PAGE_SIZES) defaultSize: (typeof PAGE_SIZES)[number] = 'A4_PORTRAIT';
  @IsIn(PAPERS) defaultPaper: (typeof PAPERS)[number] = 'RULED_NARROW';
  @IsIn(PAPER_COLORS) defaultColor: (typeof PAPER_COLORS)[number] = 'white';
}
export class CreateNotebookDto extends NotebookDefaultsDto {
  @IsUUID() requestId!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) title!: string;
  @IsIn(COVERS) cover: (typeof COVERS)[number] = 'navy';
  @ValidateIf((_, value: unknown) => value !== null) @Matches(ID) courseId: string | null = null;
}
export class UpdateNotebookDto extends NotebookDefaultsDto {
  @IsInt() @Min(1) revision!: number;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) title!: string;
  @IsIn(COVERS) cover!: (typeof COVERS)[number];
  @ValidateIf((_, value: unknown) => value !== null) @Matches(ID) courseId!: string | null;
}
export class NotebookRevisionDto {
  @IsInt() @Min(1) revision!: number;
}
export class DuplicateNotebookDto {
  @IsUUID() requestId!: string;
}
export class CreatePageDto {
  @IsUUID() requestId!: string;
  /** Inserted right after this page; null puts it first. Omitted appends at the end. */
  @IsOptional() @ValidateIf((_, value: unknown) => value !== null) @Matches(ID) afterPageId?:
    string | null;
  @IsOptional() @IsIn(PAGE_SIZES) size?: (typeof PAGE_SIZES)[number];
  @IsOptional() @IsIn(PAPERS) paper?: (typeof PAPERS)[number];
  @IsOptional() @IsIn(PAPER_COLORS) paperColor?: (typeof PAPER_COLORS)[number];
  /** Copies this page of the same notebook (paper and content). */
  @IsOptional() @Matches(ID) duplicateOf?: string;
}
export class UpdatePageDto {
  @IsInt() @Min(1) revision!: number;
  @IsIn(PAGE_SIZES) size!: (typeof PAGE_SIZES)[number];
  @IsIn(PAPERS) paper!: (typeof PAPERS)[number];
  @IsIn(PAPER_COLORS) paperColor!: (typeof PAPER_COLORS)[number];
}
export class ReorderPagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @Matches(ID, { each: true })
  order!: string[];
}
/** "Ghi vào vở": the owner's own highlights or notes, stacked onto a page as quote cards. */
export class AddQuotesDto {
  @IsUUID() requestId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @Matches(ID, { each: true })
  annotationIds!: string[];
}
export class ImageUrlDto {
  @IsUUID() requestId!: string;
  @IsString() @MinLength(8) @MaxLength(2048) url!: string;
}
export class AssetStatusDto {
  /** Comma-separated asset ids, at most 200. */
  @IsString() @Matches(/^[1-9]\d{0,18}(?:,[1-9]\d{0,18}){0,199}$/) ids!: string;
}
export class AssetVariantDto {
  @IsOptional() @IsIn(['thumb']) size?: 'thumb';
}
