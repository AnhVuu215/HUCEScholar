import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { NotebookAssetsService } from './notebook-assets.service';
import { NotebooksController } from './notebooks.controller';
import { NotebooksService } from './notebooks.service';

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [NotebooksController],
  providers: [NotebooksService, NotebookAssetsService],
  exports: [NotebooksService],
})
export class NotebooksModule {}
