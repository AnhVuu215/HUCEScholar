import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Request, Response } from 'express';
import { AuthService, passwordOptions } from '../src/auth/auth.service';
import { parseAuthEnvironment } from '../src/auth/auth.config';
import type { LoginRateLimiter } from '../src/auth/login-rate-limiter';
import type { DatabaseService } from '../src/database/database.module';

it('does not issue a new session from an email read before a concurrent email change', async () => {
  const password = randomBytes(24).toString('base64url');
  const candidate = {
    id: 1n,
    email: 'before@example.test',
    display_name: 'User',
    password_hash: await argon2.hash(password, passwordOptions),
    role: 'STUDENT',
    status: 'ACTIVE',
    verified_at: new Date(),
  };
  const issue = jest.fn();
  const tx = {
    $queryRaw: jest.fn(),
    users: {
      findUnique: jest.fn().mockResolvedValue({ ...candidate, email: 'after@example.test' }),
    },
    auth_sessions: { create: issue },
  };
  const db = {
    users: { findUnique: jest.fn().mockResolvedValue(candidate) },
    $transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx),
  };
  const limiter = { check: jest.fn() };
  const config = parseAuthEnvironment({
    DATABASE_URL: 'postgresql://localhost/hucescholar_test',
    REDIS_URL: 'redis://localhost:6379/15',
    APP_ORIGIN: 'http://127.0.0.1:3100',
    CSRF_SECRET: 'a'.repeat(64),
  });
  const service = new AuthService(
    db as unknown as DatabaseService,
    limiter as unknown as LoginRateLimiter,
    config,
  );
  const response = { cookie: jest.fn() };
  await expect(
    service.login(
      candidate.email,
      password,
      { ip: '127.0.0.1', cookies: {} } as Request,
      response as unknown as Response,
    ),
  ).rejects.toMatchObject({ status: 401 });
  expect(issue).not.toHaveBeenCalled();
  expect(response.cookie).not.toHaveBeenCalled();
});
