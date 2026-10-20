import {
  HttpException,
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { AUTH_CONFIG, AuthConfiguration } from './auth.config';
import { tokenHash } from './csrf.guard';

const consume = `
local denied = 0
for i, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  if count == 1 then redis.call('PEXPIRE', key, ARGV[i * 2]) end
  if count > tonumber(ARGV[i * 2 - 1]) then denied = 1 end
end
return denied`;

@Injectable()
export class LoginRateLimiter implements OnModuleInit, OnModuleDestroy {
  private readonly redis: Redis;
  constructor(@Inject(AUTH_CONFIG) config: AuthConfiguration) {
    this.redis = new Redis(config.redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
    });
    // Redis errors can include connection details; never emit the raw event.
    this.redis.on('error', () => undefined);
  }
  async onModuleInit() {
    try {
      await this.redis.connect();
    } catch {
      this.redis.disconnect();
      throw new Error('Login rate-limit service unavailable during startup.');
    }
  }
  onModuleDestroy() {
    this.redis.disconnect();
  }
  async check(ip: string, email: string): Promise<void> {
    let denied: unknown;
    try {
      denied = await this.redis.eval(
        consume,
        2,
        `hs:login:ip:${tokenHash(ip)}`,
        `hs:login:email:${tokenHash(email)}`,
        60,
        60_000,
        10,
        900_000,
      );
    } catch {
      throw new ServiceUnavailableException('Đăng nhập tạm thời gián đoạn. Vui lòng thử lại sau.');
    }
    if (denied === 1)
      throw new HttpException('Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.', 429);
  }
  async checkPasswordChange(ip: string, userId: string): Promise<void> {
    let denied: unknown;
    try {
      denied = await this.redis.eval(
        consume,
        2,
        `hs:password-change:user:${tokenHash(userId)}`,
        `hs:password-change:ip:${tokenHash(ip)}`,
        5,
        900_000,
        30,
        900_000,
      );
    } catch {
      throw new ServiceUnavailableException(
        'Đổi mật khẩu tạm thời gián đoạn. Vui lòng thử lại sau.',
      );
    }
    if (denied === 1)
      throw new HttpException('Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.', 429);
  }
}
