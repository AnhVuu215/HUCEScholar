import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReadingDeadlinesController, ReadingListsController } from './reading-lists.controller';
import { ReadingListsService } from './reading-lists.service';
@Module({
  imports: [AuthModule],
  controllers: [ReadingListsController, ReadingDeadlinesController],
  providers: [ReadingListsService],
})
export class ReadingListsModule {}
