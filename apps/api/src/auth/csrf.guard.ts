import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { AUTH_CONFIG, AuthConfiguration } from './auth.config';
import { cookieValue } from './auth.types';

export function tokenHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfiguration) {}

  private signature(request: Request, seed: string): string {
    return createHmac('sha256', Buffer.from(this.config.csrfSecret, 'hex'))
      .update(`${seed}:${tokenHash(cookieValue(request, this.config.sessionCookie))}`)
      .digest('hex');
  }

  issue(request: Request, response: Response): string {
    let seed = cookieValue(request, this.config.csrfCookie);
    if (!/^[A-Za-z0-9_-]{43}$/.test(seed)) {
      seed = randomBytes(32).toString('base64url');
      response.cookie(this.config.csrfCookie, seed, {
        httpOnly: true,
        secure: this.config.secureCookies,
        sameSite: 'lax',
        path: '/',
      });
    }
    return this.signature(request, seed);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const seed = cookieValue(request, this.config.csrfCookie);
    const supplied = request.get('X-CSRF-Token') ?? '';
    if (
      request.get('Origin') !== this.config.origin ||
      request.get('Sec-Fetch-Site') === 'cross-site' ||
      !/^[A-Za-z0-9_-]{43}$/.test(seed) ||
      !/^[a-f0-9]{64}$/.test(supplied) ||
      !timingSafeEqual(
        Buffer.from(supplied, 'hex'),
        Buffer.from(this.signature(request, seed), 'hex'),
      )
    ) {
      throw new ForbiddenException('Yêu cầu không hợp lệ. Vui lòng tải lại trang.');
    }
    return true;
  }
}
