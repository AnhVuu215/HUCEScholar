import { Module } from '@nestjs/common';
import { MaterialsController } from './materials.controller';
import { MaterialDraftCoreModule } from './material-draft-core.module';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { DraftPdfService } from './draft-pdf.service';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';
import { ReadingController } from './reading.controller';
import { ReadingService } from './reading.service';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleService } from './lifecycle.service';
import { PersonalLibraryController } from './personal-library.controller';
import { PersonalLibraryService } from './personal-library.service';
import { AdminReportsController, VersionReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
@Module({
  imports: [AuthModule, FilesModule, MaterialDraftCoreModule],
  controllers: [
    MaterialsController,
    ModerationController,
    LibraryController,
    ReadingController,
    LifecycleController,
    PersonalLibraryController,
    VersionReportsController,
    AdminReportsController,
  ],
  providers: [
    DraftPdfService,
    ModerationService,
    LibraryService,
    ReadingService,
    LifecycleService,
    PersonalLibraryService,
    ReportsService,
  ],
})
export class MaterialsModule {}
