import { INestApplication, PayloadTooLargeException, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';

export function configureApplication(app: INestApplication, trustedProxyIps: string[] = []): void {
  (app as NestExpressApplication).set('trust proxy', trustedProxyIps);
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(helmet());
  app.use(cookieParser());
  // Quotes, quad coordinates and a full-size private note can exceed the default small body.
  (app as NestExpressApplication).useBodyParser('json', {
    limit: '64kb',
    verify: (req: Request, _res: Response, body: Buffer) => {
      if (
        body.length > 16 * 1024 &&
        !/^\/api\/v1\/library\/versions\/[1-9]\d{0,18}\/highlights(?:\/[1-9]\d{0,18})?(?:\?|$)/.test(
          req.url ?? '',
        )
      )
        throw new PayloadTooLargeException();
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
}
