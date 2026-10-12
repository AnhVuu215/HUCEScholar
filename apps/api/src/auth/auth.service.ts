import { Inject, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Request, Response } from 'express';
import { DatabaseService } from '../database/database.module';
import { AUTH_CONFIG, AuthConfiguration } from './auth.config';
import { cookieValue, Profile, Role } from './auth.types';
import { tokenHash } from './csrf.guard';
import { LoginRateLimiter } from './login-rate-limiter';

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
}
