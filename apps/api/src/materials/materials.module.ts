import { Module } from '@nestjs/common';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { DraftPdfService } from './draft-pdf.service';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
@Module({
  imports: [AuthModule, FilesModule],
  controllers: [MaterialsController, ModerationController],
  providers: [MaterialsService, DraftPdfService, ModerationService],
})
export class MaterialsModule {}
