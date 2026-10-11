import { Module } from '@nestjs/common';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { DraftPdfService } from './draft-pdf.service';
@Module({
  imports: [AuthModule, FilesModule],
  controllers: [MaterialsController],
  providers: [MaterialsService, DraftPdfService],
})
export class MaterialsModule {}
