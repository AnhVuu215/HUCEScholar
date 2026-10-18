import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
export class ProfileUpdateDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  displayName!: string;
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
export class ReaderPreferencesDto {
  @IsIn(['#FFF59D', '#A5D6A7', '#90CAF9', '#F8BBD0', '#CE93D8', '#FFCC80', '#80CBC4', '#B0BEC5'])
  highlightColor!: string;
  @IsIn(['fit-width', '100', '125', '150']) defaultZoom!: string;
  @IsBoolean() annotationPanelOpen!: boolean;
}
export class PreferencesUpdateDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => ReaderPreferencesDto)
  preferences!: ReaderPreferencesDto;
  @IsInt() @Min(0) @Max(2147483646) revision!: number;
}
