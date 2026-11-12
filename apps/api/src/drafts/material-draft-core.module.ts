import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FilesModule } from '../files/files.module';
import { MaterialsService } from './materials.service';
import { SourceUploadService } from './source-upload.service';
import { DocxTools, SourceConversionProcessor } from './source-conversion.processor';
@Module({
  imports: [DatabaseModule, FilesModule],
  providers: [MaterialsService, SourceUploadService, DocxTools, SourceConversionProcessor],
  exports: [MaterialsService, SourceUploadService, DocxTools, SourceConversionProcessor],
})
export class MaterialDraftCoreModule {}
