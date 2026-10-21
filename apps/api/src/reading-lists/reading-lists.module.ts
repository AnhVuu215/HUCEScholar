import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReadingListsController } from './reading-lists.controller';
import { ReadingListsService } from './reading-lists.service';
@Module({
  imports: [AuthModule],
  controllers: [ReadingListsController],
  providers: [ReadingListsService],
})
export class ReadingListsModule {}
