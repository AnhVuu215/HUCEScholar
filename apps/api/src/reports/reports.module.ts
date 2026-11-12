import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LibraryModule } from '../library/library.module';
import { ModerationModule } from '../moderation/moderation.module';
import { AdminReportsController, VersionReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Readers report a problem with a version; admins resolve or dismiss it, optionally hiding it. */
@Module({
  imports: [AuthModule, LibraryModule, ModerationModule],
  controllers: [VersionReportsController, AdminReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
