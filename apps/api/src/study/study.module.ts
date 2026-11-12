import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LibraryModule } from '../library/library.module';
import { StudyCardsController } from './study-cards.controller';
import { StudyCardsService } from './study-cards.service';

/**
 * Study cards made from one's own highlights: the review schedule, statistics and export.
 * The morning reminder (StudyReminders) runs on the file worker, from CalendarRemindersModule.
 */
@Module({
  imports: [AuthModule, LibraryModule],
  controllers: [StudyCardsController],
  providers: [StudyCardsService],
})
export class StudyModule {}
