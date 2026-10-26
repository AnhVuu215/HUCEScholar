import { trim } from '../dto-transforms';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { ReadingRevisionDto } from './reading.dto';

export interface HighlightAnchor {
  coordinateSpace: 'normalized-pdf-v1';
  quote: string;
  quads: number[][];
}
export const highlightColors = [
  '#FFF59D',
  '#A5D6A7',
  '#90CAF9',
  '#F8BBD0',
  '#CE93D8',
  '#FFCC80',
  '#80CBC4',
  '#B0BEC5',
];
@ValidatorConstraint({ name: 'highlightAnchor', async: false })
export class HighlightAnchorValidator implements ValidatorConstraintInterface {
  validate(value: unknown): value is HighlightAnchor {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const a = value as Record<string, unknown>;
    if (
      Object.keys(a).sort().join(',') !== 'coordinateSpace,quads,quote' ||
      a.coordinateSpace !== 'normalized-pdf-v1' ||
      typeof a.quote !== 'string' ||
      !a.quote.trim() ||
      a.quote.length > 2000 ||
      !Array.isArray(a.quads) ||
      !a.quads.length ||
      a.quads.length > 100
    )
      return false;
    return a.quads.every((q: unknown) => {
      if (
        !Array.isArray(q) ||
        q.length !== 8 ||
        !q.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)
      )
        return false;
      let area = 0;
      for (let i = 0; i < 8; i += 2) area += q[i] * q[(i + 3) % 8] - q[(i + 2) % 8] * q[i + 1];
      return Math.abs(area) > 1e-10;
    });
  }
  defaultMessage() {
    return 'Vùng tô phải có trích đoạn và tọa độ hợp lệ trên một trang PDF.';
  }
}
export class CreateHighlightDto {
  @IsInt() @Min(1) @Max(2147483647) pageNumber!: number;
  @Transform(trim) @IsString() @MaxLength(4000) content!: string;
  @IsIn(highlightColors) color!: string;
  @Validate(HighlightAnchorValidator) anchor!: HighlightAnchor;
  @IsUUID('4') requestId!: string;
}
export class UpdateHighlightDto extends ReadingRevisionDto {
  @Transform(trim) @IsString() @MaxLength(4000) content!: string;
  @IsIn(highlightColors) color!: string;
}
