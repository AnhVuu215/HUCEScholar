import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.module';
import { AUTH_CONFIG, AuthConfiguration } from './auth.config';
import { AuthService, passwordOptions } from './auth.service';
import { tokenHash } from './csrf.guard';
import { LoginRateLimiter } from './login-rate-limiter';
import { Mailer } from './mailer';

export const RESET_TOKEN_TTL_MS = 30 * 60_000;
const invalid = () =>
  new BadRequestException({
    code: 'RESET_TOKEN_INVALID',
    message: 'Liên kết khôi phục không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.',
  });

/**
 * AUTH-03. A request always gets the same answer and the lookup and delivery happen after the
 * response, so neither the reply nor its timing tells whether an account exists. Tokens are
 * random, stored only as a hash, single-use and short-lived; using one revokes every session.
 */
@Injectable()
export class RecoveryService {
  /** Deliveries still in flight; tests await them, production never needs to. */
  readonly pending = new Set<Promise<void>>();
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
    private readonly limiter: LoginRateLimiter,
    private readonly mailer: Mailer,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfiguration,
  ) {}

  async request(email: string, ip: string) {
    if (!this.mailer.enabled)
      throw new ServiceUnavailableException({
        code: 'RECOVERY_UNAVAILABLE',
        message:
          'Hệ thống chưa gửi được thư khôi phục. Liên hệ quản trị viên để được cấp lại mật khẩu.',
      });
    await this.limiter.checkRecovery(ip, `request:${email}`);
    const work = this.deliver(email).catch(() => {
      Logger.warn('Recovery request could not be completed.', 'Auth');
    });
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work));
  }

  private async deliver(email: string) {
    const token = randomBytes(32).toString('base64url');
    const user = await this.db.$transaction(async (tx) => {
      const found = await tx.users.findUnique({ where: { email } });
      if (!found) return null;
      try {
        // Locked, pending or unverified accounts are recovered by an administrator instead.
        await this.auth.lockUser(tx, found.id);
      } catch (error) {
        if (error instanceof UnauthorizedException) return null;
        throw error;
      }
      // Only the newest link works.
      await tx.$executeRaw`UPDATE hucescholar.password_reset_tokens SET used_at=greatest(clock_timestamp(), created_at) WHERE user_id=${found.id} AND used_at IS NULL`;
      await tx.password_reset_tokens.create({
        data: {
          user_id: found.id,
          token_hash: tokenHash(token),
          expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });
      await tx.audit_events.create({
        data: {
          actor_id: found.id,
          entity_type: 'USER',
          entity_id: found.id,
          event_type: 'ACCOUNT_RECOVERY_REQUESTED',
        },
      });
      return found;
    });
    if (!user) return;
    // The token travels in the fragment, so it never reaches server logs or a Referer header.
    const link = `${this.config.origin}/reset-password#token=${token}`;
    await this.mailer.send({
      to: user.email,
      subject: 'Đặt lại mật khẩu HUCEScholar',
      text: [
        `Chào ${user.display_name},`,
        '',
        'Có yêu cầu đặt lại mật khẩu cho tài khoản HUCEScholar của bạn. Mở liên kết dưới đây trong 30 phút để đặt mật khẩu mới:',
        '',
        link,
        '',
        'Liên kết chỉ dùng được một lần. Đặt mật khẩu mới sẽ đăng xuất mọi phiên đang mở.',
        'Nếu bạn không yêu cầu, hãy bỏ qua thư này; mật khẩu hiện tại vẫn giữ nguyên.',
      ].join('\n'),
    });
  }

  async complete(token: string, newPassword: string, ip: string) {
    await this.limiter.checkRecovery(ip, 'complete');
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalid();
    try {
      const hash = await argon2.hash(newPassword, passwordOptions);
      await this.db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: bigint; user_id: bigint }[]>`
          SELECT id, user_id FROM hucescholar.password_reset_tokens
          WHERE token_hash=${tokenHash(token)} AND used_at IS NULL AND expires_at > clock_timestamp()
          FOR UPDATE`;
        if (!rows.length) throw invalid();
        const id = rows[0].user_id;
        try {
          await this.auth.lockUser(tx, id);
        } catch (error) {
          if (error instanceof UnauthorizedException) throw invalid();
          throw error;
        }
        await tx.users.update({
          where: { id },
          data: {
            password_hash: hash,
            must_change_password: false,
            revision: { increment: 1 },
            updated_at: new Date(),
          },
        });
        await tx.$executeRaw`UPDATE hucescholar.auth_sessions SET revoked_at=greatest(clock_timestamp(), created_at) WHERE user_id=${id} AND revoked_at IS NULL`;
        await tx.$executeRaw`UPDATE hucescholar.password_reset_tokens SET used_at=greatest(clock_timestamp(), created_at) WHERE user_id=${id} AND used_at IS NULL`;
        await tx.audit_events.create({
          data: {
            actor_id: id,
            entity_type: 'USER',
            entity_id: id,
            event_type: 'ACCOUNT_PASSWORD_RESET',
          },
        });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // ORM diagnostics may contain token or password hashes.
      throw new ServiceUnavailableException(
        'Đặt lại mật khẩu tạm thời gián đoạn. Chưa xác nhận kết quả; thử đăng nhập bằng mật khẩu mới hoặc yêu cầu liên kết mới.',
      );
    }
  }
}
