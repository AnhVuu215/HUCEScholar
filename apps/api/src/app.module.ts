import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AcademicModule } from './academic/academic.module';
import { DraftsModule } from './drafts/drafts.module';
import { LibraryModule } from './library/library.module';
import { ModerationModule } from './moderation/moderation.module';
import { ReportsModule } from './reports/reports.module';
import { ReadingModule } from './reading/reading.module';
import { StudyModule } from './study/study.module';
import { AccountModule } from './account/account.module';
import { OpsModule } from './ops/ops.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReadingListsModule } from './reading-lists/reading-lists.module';
import { CalendarModule } from './calendar/calendar.module';
import { NotebooksModule } from './notebooks/notebooks.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    AcademicModule,
    DraftsModule,
    LibraryModule,
    ModerationModule,
    ReportsModule,
    ReadingModule,
    StudyModule,
    AccountModule,
    OpsModule,
    NotificationsModule,
    ReadingListsModule,
    CalendarModule,
    NotebooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
