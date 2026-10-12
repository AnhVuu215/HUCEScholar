import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { parseEnvironment } from './config';
import { configureApplication } from './configure-application';
import { SafeLogger } from './safe-logger';
import { parseAuthEnvironment } from './auth/auth.config';

async function bootstrap(): Promise<void> {
  const environment = parseEnvironment(process.env);
  const app = await NestFactory.create(AppModule, {
    logger: new SafeLogger(),
    abortOnError: false,
  });
  try {
    configureApplication(app, parseAuthEnvironment(process.env).trustedProxyIps);
    await app.listen(environment.port, environment.host);
    Logger.log(`API listening on ${environment.host}:${environment.port}`, 'Bootstrap');
  } catch (error) {
    await app.close();
    throw error;
  }
}

bootstrap().catch(() => {
  Logger.error(
    'Startup failed. Check required configuration and database/Redis availability.',
    'Bootstrap',
  );
  process.exitCode = 1;
});
