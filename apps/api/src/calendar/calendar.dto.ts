import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const integer = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : value;
export const calendarColors = ['blue', 'green', 'orange', 'purple', 'red', 'gray'] as const;
/** CAL-02 weekly repeat. Weekdays and `until` are local to `utcOffset` (minutes east of UTC). */
export class CalendarRepeatDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays!: number[];
  @Matches(/^\d{4}-\d{2}-\d{2}$/) until!: string;
  @IsInt() @Min(-840) @Max(840) utcOffset!: number;
}
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
  /** Only sessions repeat; absent means no repeat. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CalendarRepeatDto)
  repeat: CalendarRepeatDto | null = null;
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
/** One occurrence of a series, named by its original start. */
export class CalendarOccurrenceDto extends CalendarRevisionDto {
  @IsISO8601({ strict: true }) occurrenceStart!: string;
}
/** "Chỉ buổi này": the occurrence leaves the series and becomes its own item with these fields. */
export class CalendarDetachDto extends CreateCalendarItemDto {
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
  @IsISO8601({ strict: true }) occurrenceStart!: string;
  /** Copy the series' stored link, including one withheld because access ended. */
  @IsOptional() @IsBoolean() keepSource = false;
}
