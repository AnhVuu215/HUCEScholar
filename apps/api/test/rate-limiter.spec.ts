import Redis from 'ioredis';
import { ServiceUnavailableException } from '@nestjs/common';
import { LoginRateLimiter } from '../src/auth/login-rate-limiter';
import { parseAuthEnvironment } from '../src/auth/auth.config';

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    eval: jest.fn(),
  })),
);

describe('rate limiter service recovery', () => {
  const config = parseAuthEnvironment({
    DATABASE_URL: 'postgresql://localhost/test',
    REDIS_URL: 'redis://localhost/15',
    APP_ORIGIN: 'http://localhost:3100',
    CSRF_SECRET: 'a'.repeat(64),
  });
  it('continues bounded reconnect attempts after a prolonged outage', () => {
    new LoginRateLimiter(config);
    const options = (Redis as unknown as jest.Mock).mock.calls[0][1];
    expect(options.enableOfflineQueue).toBe(false);
    expect(options.retryStrategy(1000)).toBeGreaterThan(0);
    expect(options.retryStrategy(1000)).toBeLessThanOrEqual(5000);
  });
  it('fails closed during an outage and resumes checking after recovery', async () => {
    const limiter = new LoginRateLimiter(config);
    const connection = (Redis as unknown as jest.Mock).mock.results.at(-1)!.value;
    connection.eval
      .mockRejectedValueOnce(new Error('connection unavailable'))
      .mockResolvedValueOnce(0);
    await expect(limiter.check('127.0.0.1', 'test@example.test')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(limiter.check('127.0.0.1', 'test@example.test')).resolves.toBeUndefined();
    limiter.onModuleDestroy();
  });
  it('stops background retry timers if its initial connection fails', async () => {
    const limiter = new LoginRateLimiter(config);
    const connection = (Redis as unknown as jest.Mock).mock.results.at(-1)!.value;
    connection.connect.mockRejectedValueOnce(new Error('raw connection details'));
    await expect(limiter.onModuleInit()).rejects.toThrow(
      'Login rate-limit service unavailable during startup.',
    );
    expect(connection.disconnect).toHaveBeenCalledTimes(1);
  });
});
