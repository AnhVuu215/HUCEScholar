import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

export function configureApplication(app: INestApplication): void {
  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
}
