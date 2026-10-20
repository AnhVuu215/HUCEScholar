import { Controller, Get, Module, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DatabaseModule } from '../database/database.module';
import { FilesModule } from '../files/files.module';
import { ReadinessService } from './readiness.service';

@Controller('health')
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService) {}
  /** Readiness, separate from liveness (`GET /health`): 503 when a critical dependency fails. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    const result = await this.readiness.check();
    if (result.status === 'not_ready') response.status(503);
    return { service: 'hucescholar-api', ...result };
  }
}

@Module({
  imports: [DatabaseModule, FilesModule],
  controllers: [ReadinessController],
  providers: [ReadinessService],
})
export class OpsModule {}
