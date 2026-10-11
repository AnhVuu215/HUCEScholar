import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { parseEnvironment } from './config';
import { configureApplication } from './configure-application';

async function bootstrap(): Promise<void> {
  const environment = parseEnvironment(process.env);
  const app = await NestFactory.create(AppModule);
  configureApplication(app);
  await app.listen(environment.port, environment.host);
  Logger.log(`API listening on ${environment.host}:${environment.port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : 'Startup failed.', 'Bootstrap');
  process.exitCode = 1;
});
