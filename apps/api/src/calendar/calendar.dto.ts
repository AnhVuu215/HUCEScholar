import { trim, integer } from '../dto-transforms';
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

export const calendarColors = ['blue', 'green', 'orange', 'purple', 'red', 'gray'] as const;
/** CAL-03 lead times in minutes; 0 reminds at the start (or due time). */
export const remindMinutes = [0, 5, 10, 15, 30, 60, 120, 1440] as const;
/**
 * CAL-07 leads for an all-day item, which starts at local midnight: -480 is 08:00 that day,
 * 240 is 20:00 the evening before, 960 is 08:00 the day before.
 */
export const allDayRemindMinutes = [-480, 240, 960] as const;
/**
 * CAL-02/CAL-07 repeat. Weekly on `weekdays`, or monthly on the first date's day of the month,
 * every `interval` weeks or months; it ends on `until` or after `count` times (exactly one).
 * Weekdays and dates are local to `utcOffset` (minutes east of UTC).
 */
export class CalendarRepeatDto {
  @IsOptional() @IsIn(['WEEKLY', 'MONTHLY']) freq: 'WEEKLY' | 'MONTHLY' = 'WEEKLY';
  @IsOptional() @IsInt() @Min(1) @Max(12) interval = 1;
  @ValidateIf((o: CalendarRepeatDto) => o.freq !== 'MONTHLY')
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays: number[] = [];
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) until?: string;
  @IsOptional() @IsInt() @Min(1) @Max(400) count?: number;
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
  /** Only items with a time can remind; absent means no reminder. */
  @IsOptional()
  @IsIn([...remindMinutes, ...allDayRemindMinutes])
  remindMinutes: number | null = null;
  /** CAL-07: up to two more reminders, besides `remindMinutes`. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsIn([...remindMinutes, ...allDayRemindMinutes], { each: true })
  remindMore: number[] = [];
  /** Also email the owner; needs a reminder. */
  @IsOptional() @IsBoolean() remindEmail = false;
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
/** CAL-05. The browser's offset dates all-day items outside a series; notes are opt-in. */
export class CalendarExportDto {
  @Transform(({ value }) =>
    typeof value === 'string' && /^-?\d{1,3}$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(-840)
  @Max(840)
  utcOffset!: number;
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  details = false;
  /** CAL-07: also the due dates of followed courses' reading lists. */
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  deadlines = false;
  /** CAL-07: local dates (inclusive) to export; both or neither. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}
/** CAL-07: the importer's offset places dates and floating times of the file. */
export class CalendarImportDto {
  @Transform(({ value }) =>
    typeof value === 'string' && /^-?\d{1,3}$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(-840)
  @Max(840)
  utcOffset!: number;
}
export class CalendarTasksDto {
  @Transform(integer) @IsInt() @Min(1) @Max(100000) page = 1;
  @Transform(integer) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsOptional() @IsIn(['open', 'done']) status: 'open' | 'done' = 'open';
}
/** CAL-07: a repeating task is done one occurrence at a time. */
export class CalendarOccurrenceDoneDto {
  @IsBoolean() done!: boolean;
  @IsOptional() @IsISO8601({ strict: true }) occurrenceStart?: string;
}
/** One occurrence of a series, named by its original start. */
export class CalendarOccurrenceDto extends CalendarRevisionDto {
  @IsISO8601({ strict: true }) occurrenceStart!: string;
}
/**
 * CAL-07 "Buổi này và các buổi sau": the series ends before the occurrence, and a new item with
 * these fields (repeating or not) starts at it.
 */
export class CalendarSplitDto extends CreateCalendarItemDto {
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
  @IsISO8601({ strict: true }) occurrenceStart!: string;
  @IsOptional() @IsBoolean() keepSource = false;
}
/** "Chỉ buổi này": the occurrence leaves the series and becomes its own item with these fields. */
export class CalendarDetachDto extends CreateCalendarItemDto {
  @IsInt() @Min(1) @Max(2147483646) revision!: number;
  @IsISO8601({ strict: true }) occurrenceStart!: string;
  /** Copy the series' stored link, including one withheld because access ended. */
  @IsOptional() @IsBoolean() keepSource = false;
}
