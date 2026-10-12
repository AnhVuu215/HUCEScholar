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
@Module({
  imports: [AuthModule, FilesModule],
  controllers: [MaterialsController, ModerationController, LibraryController],
  providers: [MaterialsService, DraftPdfService, ModerationService, LibraryService],
})
export class MaterialsModule {}
