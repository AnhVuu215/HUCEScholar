import 'reflect-metadata';
import { Controller, Get, Req, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { configureApplication } from '../src/configure-application';

@Controller('source')
class SourceController {
  @Get() source(@Req() req: Request) {
    return { ip: req.ip };
  }
}

describe('explicit proxy trust boundary', () => {
  let app: INestApplication;
  afterEach(async () => app?.close());
  async function start(trustedProxyIps: string[]) {
    app = (
      await Test.createTestingModule({ controllers: [SourceController] }).compile()
    ).createNestApplication();
    configureApplication(app, trustedProxyIps);
    await app.init();
  }
  it('ignores spoofed forwarded IP from an untrusted immediate peer', async () => {
    await start(['192.0.2.1']);
    const result = await request(app.getHttpServer())
      .get('/api/v1/source')
      .set('X-Forwarded-For', '198.51.100.2');
    expect(result.body.ip).toMatch(/127\.0\.0\.1$/);
  });
  it('uses the nearest untrusted hop behind a configured trusted proxy', async () => {
    await start(['127.0.0.1', '::1']);
    const result = await request(app.getHttpServer())
      .get('/api/v1/source')
      .set('X-Forwarded-For', '203.0.113.9, 198.51.100.2');
    expect(result.body.ip).toBe('198.51.100.2');
  });
});
