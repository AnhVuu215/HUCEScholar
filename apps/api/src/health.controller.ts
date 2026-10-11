import { Controller, Get, Header } from '@nestjs/common';

@Controller('health')
export class HealthController {
  // Liveness only: this response makes no claim about database, queue or storage readiness.
  @Get()
  @Header('Cache-Control', 'no-store')
  getHealth(): { status: 'ok'; service: 'hucescholar-api' } {
    return { status: 'ok', service: 'hucescholar-api' };
  }
}
