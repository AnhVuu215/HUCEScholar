import { trim } from '../dto-transforms';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const MAX_READING_ITEMS = 100;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export class ReadingItemDto {
  @Transform(trim) @IsString() @MaxLength(120) section!: string;
  @IsString() @Matches(/^[1-9]\d{0,18}$/) versionId!: string;
  @Transform(trim) @IsString() @MaxLength(500) note!: string;
  /** CAL-04b: a calendar day (`YYYY-MM-DD`) or null; absent means no due date. */
  @IsOptional() @Matches(DATE) dueOn: string | null = null;
  /** `HH:MM` in Vietnam time, only with a due date; absent means the end of that day. */
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) dueTime: string | null = null;
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
/** COURSE-02: the reader's own "đã đọc" mark. */
export class ReadMarkDto {
  @IsBoolean() read!: boolean;
}
/** Lead times a follower may choose before an unread due date, in minutes. */
export const deadlineRemindMinutes = [60, 180, 1440, 2880] as const;
export class FollowReadingListsDto {
  @IsBoolean() following!: boolean;
  /** Absent keeps the current choice; null turns reminders off. Only while following. */
  @IsOptional() @IsIn([...deadlineRemindMinutes, null]) remindMinutes?: number | null;
}
/** Calendar days; `to` is exclusive. */
export class ReadingDeadlinesDto {
  @Matches(DATE) from!: string;
  @Matches(DATE) to!: string;
}
