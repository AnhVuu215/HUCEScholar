import { Module } from '@nestjs/common';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
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
@Module({
  imports: [AuthModule, FilesModule],
  controllers: [
    MaterialsController,
    ModerationController,
    LibraryController,
    ReadingController,
    LifecycleController,
  ],
  providers: [
    MaterialsService,
    DraftPdfService,
    ModerationService,
    LibraryService,
    ReadingService,
    LifecycleService,
  ],
})
export class MaterialsModule {}
