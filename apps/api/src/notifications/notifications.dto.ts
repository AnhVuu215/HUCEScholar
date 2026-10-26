import { integer } from '../dto-transforms';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class NotificationListDto {
  @Transform(integer) @IsInt() @Min(1) @Max(100000) page = 1;
  @Transform(integer) @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional() @IsIn(['unread']) filter?: 'unread';
}
