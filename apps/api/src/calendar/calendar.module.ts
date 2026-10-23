import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarController } from './calendar.controller';
import { CalendarRemindersModule } from './calendar-reminders';
import { CalendarService } from './calendar.service';
@Module({
  imports: [AuthModule, CalendarRemindersModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
