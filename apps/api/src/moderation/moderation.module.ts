import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { MaterialDraftCoreModule } from '../drafts/material-draft-core.module';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleService } from './lifecycle.service';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

/** Admin decisions on materials: reviewing submitted versions, hiding and restoring documents. */
@Module({
  imports: [AuthModule, FilesModule, MaterialDraftCoreModule],
  controllers: [ModerationController, LifecycleController],
  providers: [ModerationService, LifecycleService],
  exports: [LifecycleService],
})
export class ModerationModule {}
