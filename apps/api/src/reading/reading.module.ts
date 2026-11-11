import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LibraryModule } from '../library/library.module';
import { PersonalLibraryController } from './personal-library.controller';
import { PersonalLibraryService } from './personal-library.service';
import { ReadingController } from './reading.controller';
import { ReadingService } from './reading.service';

/**
 * A reader's private data on a version: page notes, text highlights, reading progress, saved and
 * recent documents, and note search and export. Nobody else sees it, admins included.
 */
@Module({
  imports: [AuthModule, LibraryModule],
  controllers: [ReadingController, PersonalLibraryController],
  providers: [ReadingService, PersonalLibraryService],
})
export class ReadingModule {}
