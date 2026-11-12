import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { LibraryModule } from '../library/library.module';
import { DraftPdfService } from './draft-pdf.service';
import { MaterialDraftCoreModule } from './material-draft-core.module';
import { MaterialsController } from './materials.controller';

/**
 * A student's own materials: drafts, PDF or Word upload, submitting for review and next versions.
 * MaterialDraftCoreModule holds what the file worker shares (ownership checks, Word conversion).
 */
@Module({
  imports: [AuthModule, FilesModule, MaterialDraftCoreModule, LibraryModule],
  controllers: [MaterialsController],
  providers: [DraftPdfService],
})
export class DraftsModule {}
