import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Request, Response } from 'express';
import { DatabaseService } from '../database/database.module';
import { AUTH_CONFIG, AuthConfiguration } from './auth.config';
import { cookieValue, Profile, Role } from './auth.types';
import { tokenHash } from './csrf.guard';
import { LoginRateLimiter } from './login-rate-limiter';
import type { Prisma } from '../generated/prisma/client';

export const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;
const sessionDuration = 8 * 60 * 60 * 1000;
const profile = (user: {
  id: bigint;
  email: string;
  display_name: string;
  role: string;
}): Profile => ({
  id: user.id.toString(),
  email: user.email,
  displayName: user.display_name,
  role: user.role as Role,
});

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash = '';
  constructor(
    private readonly db: DatabaseService,
    private readonly limiter: LoginRateLimiter,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfiguration,
  ) {}
  async onModuleInit() {
    this.dummyHash = await argon2.hash(randomBytes(32), passwordOptions);
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.secureCookies,
      sameSite: 'lax' as const,
      path: '/',
    };
  }
  /** All self-service writes use the same user -> session lock order as login. */
  async lockUser(tx: Prisma.TransactionClient, id: bigint) {
    await tx.$queryRaw`SELECT id FROM hucescholar.users WHERE id=${id} FOR UPDATE`;
    const user = await tx.users.findUnique({ where: { id } });
    if (!user || user.status !== 'ACTIVE' || !user.verified_at) throw new UnauthorizedException();
    return user;
  }
  async requireLiveSession(tx: Prisma.TransactionClient, request: Request, id: bigint) {
    const token = cookieValue(request, this.config.sessionCookie);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException();
    const rows = await tx.$queryRaw<{ expires_at: Date }[]>`
      SELECT expires_at FROM hucescholar.auth_sessions
      WHERE user_id=${id} AND token_hash=${tokenHash(token)} AND revoked_at IS NULL
        AND expires_at > clock_timestamp() FOR UPDATE`;
    if (!rows.length) throw new UnauthorizedException();
    return rows[0];
  }
  async login(
    email: string,
    password: string,
    request: Request,
    response: Response,
  ): Promise<Profile> {
    await this.limiter.check(request.ip ?? '', email);
    const candidate = await this.db.users.findUnique({ where: { email } });
    let valid = false;
    try {
      valid = await argon2.verify(candidate?.password_hash ?? this.dummyHash, password);
    } catch {
      /* invalid stored hash fails closed */
    }
    const reject = () => new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    if (!valid || !candidate) throw reject();
    const token = randomBytes(32).toString('base64url');
    const user = await this.db.$transaction(async (tx) => {
      // Serialize issuance with account/password changes to prevent a post-revocation session race.
      await tx.$queryRaw`SELECT id FROM hucescholar.users WHERE id=${candidate.id} FOR UPDATE`;
      const current = await tx.users.findUnique({ where: { id: candidate.id } });
      if (
        !current ||
        current.status !== 'ACTIVE' ||
        !current.verified_at ||
        current.email !== candidate.email ||
        current.password_hash !== candidate.password_hash
      )
        throw reject();
      const previous = cookieValue(request, this.config.sessionCookie);
      if (/^[A-Za-z0-9_-]{43}$/.test(previous)) {
        await tx.auth_sessions.updateMany({
          where: { token_hash: tokenHash(previous), revoked_at: null },
          data: { revoked_at: new Date() },
        });
      }
      await tx.auth_sessions.create({
        data: {
          user_id: current.id,
          token_hash: tokenHash(token),
          expires_at: new Date(Date.now() + sessionDuration),
        },
      });
      return profile(current);
    });
    response.cookie(this.config.sessionCookie, token, {
      ...this.cookieOptions(),
      maxAge: sessionDuration,
    });
    return user;
  }

  async authenticate(request: Request): Promise<Profile> {
    const token = cookieValue(request, this.config.sessionCookie);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException();
    const session = await this.db.auth_sessions.findUnique({
      where: { token_hash: tokenHash(token) },
      include: { users: true },
    });
    if (
      !session ||
      session.revoked_at ||
      session.expires_at <= new Date() ||
      session.users.status !== 'ACTIVE' ||
      !session.users.verified_at
    )
      throw new UnauthorizedException();
    return profile(session.users);
  }

  async logout(request: Request, response: Response): Promise<void> {
    const token = cookieValue(request, this.config.sessionCookie);
    if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
      await this.db.auth_sessions.updateMany({
        where: { token_hash: tokenHash(token), revoked_at: null },
        data: { revoked_at: new Date() },
      });
    }
    response.clearCookie(this.config.sessionCookie, this.cookieOptions());
    response.clearCookie(this.config.csrfCookie, this.cookieOptions());
  }
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    request: Request,
    response: Response,
  ): Promise<void> {
    try {
      await this.limiter.checkPasswordChange(request.ip ?? '', userId);
      const id = BigInt(userId);
      const candidate = await this.db.users.findUnique({ where: { id } });
      if (!candidate) throw new UnauthorizedException();
      let valid = false;
      try {
        valid = await argon2.verify(candidate.password_hash, currentPassword);
      } catch {
        /* fail closed */
      }
      if (!valid)
        throw new BadRequestException({
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Mật khẩu hiện tại không đúng.',
        });
      if (currentPassword === newPassword)
        throw new BadRequestException({
          code: 'INVALID_PASSWORD_INPUT',
          message: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
        });
      const hash = await argon2.hash(newPassword, passwordOptions);
      const token = randomBytes(32).toString('base64url');
      const expires = await this.db.$transaction(async (tx) => {
        const current = await this.lockUser(tx, id);
        if (
          current.email !== candidate.email ||
          current.password_hash !== candidate.password_hash ||
          current.revision >= 2147483646
        )
          throw new ConflictException({
            code: 'CREDENTIAL_CHANGED',
            message: 'Thông tin đăng nhập đã thay đổi. Đăng nhập lại để tiếp tục.',
          });
        const session = await this.requireLiveSession(tx, request, id);
        await tx.users.update({
          where: { id },
          data: { password_hash: hash, revision: { increment: 1 }, updated_at: new Date() },
        });
        await tx.$executeRaw`UPDATE hucescholar.auth_sessions SET revoked_at=greatest(clock_timestamp(), created_at) WHERE user_id=${id} AND revoked_at IS NULL`;
        await tx.$executeRaw`UPDATE hucescholar.password_reset_tokens SET used_at=greatest(clock_timestamp(), created_at) WHERE user_id=${id} AND used_at IS NULL`;
        await tx.auth_sessions.create({
          data: { user_id: id, token_hash: tokenHash(token), expires_at: session.expires_at },
        });
        await tx.audit_events.create({
          data: {
            actor_id: id,
            entity_type: 'USER',
            entity_id: id,
            event_type: 'ACCOUNT_PASSWORD_CHANGED',
          },
        });
        return session.expires_at;
      });
      // Cookie issuance follows commit; absolute expiry is inherited, never restarted at eight hours.
      response.cookie(this.config.sessionCookie, token, {
        ...this.cookieOptions(),
        maxAge: Math.max(0, expires.getTime() - Date.now()),
      });
      response.clearCookie(this.config.csrfCookie, this.cookieOptions());
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // ORM diagnostics may contain password/token hashes. Do not expose them to logs or responses.
      throw new ServiceUnavailableException(
        'Đổi mật khẩu tạm thời gián đoạn. Chưa xác nhận kết quả; đăng nhập lại trước khi thử tiếp.',
      );
    }
  }
}
