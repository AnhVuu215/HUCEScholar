import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const integer = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : value;
export const calendarColors = ['blue', 'green', 'orange', 'purple', 'red', 'gray'] as const;
/** Full replacement of an item's fields; done state has its own endpoint. */
export class CalendarFieldsDto {
  @IsIn(['EVENT', 'TASK']) kind!: 'EVENT' | 'TASK';
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @Transform(trim) @IsString() @MaxLength(2000) details = '';
  /** EVENT: start (required). TASK: due time, or null for a task without a date. */
  @ValidateIf((_, value: unknown) => value !== null)
  @IsISO8601({ strict: true })
  startsAt!: string | null;
  @ValidateIf((_, value: unknown) => value !== null)
  @IsISO8601({ strict: true })
  endsAt!: string | null;
  @IsBoolean() allDay!: boolean;
  @IsIn(calendarColors) color: (typeof calendarColors)[number] = 'blue';
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  versionId!: string | null;
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  pageNumber!: number | null;
}
export class CreateCalendarItemDto extends CalendarFieldsDto {
  @IsUUID('4') requestId!: string;
}
export class UpdateCalendarItemDto extends CalendarFieldsDto {
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
  /** Keep the stored link as is (versionId/pageNumber null); lets a withheld link survive edits. */
  @IsOptional() @IsBoolean() keepSource = false;
}
export class CalendarRevisionDto {
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
export class CalendarDoneDto {
  @IsBoolean() done!: boolean;
}
export class CalendarRangeDto {
  @IsISO8601({ strict: true }) from!: string;
  @IsISO8601({ strict: true }) to!: string;
}
export class CalendarTasksDto {
  @Transform(integer) @IsInt() @Min(1) @Max(100000) page = 1;
  @Transform(integer) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsOptional() @IsIn(['open', 'done']) status: 'open' | 'done' = 'open';
}
