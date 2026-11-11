import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { MaterialDraftCoreModule } from '../drafts/material-draft-core.module';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

/** The published library: catalog, search and reading or downloading a version a reader may open. */
@Module({
  imports: [AuthModule, FilesModule, MaterialDraftCoreModule],
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
