import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.module';
import { Prisma } from '../generated/prisma/client';
import { AUTH_CONFIG, AuthConfiguration } from './auth.config';
import { passwordOptions } from './auth.service';
import { tokenHash } from './csrf.guard';
import { LoginRateLimiter } from './login-rate-limiter';
import { Mailer } from './mailer';

export const SIGNUP_TOKEN_TTL_MS = 24 * 60 * 60_000;
export type SignupRole = 'STUDENT' | 'LECTURER';
const invalid = () =>
  new BadRequestException({
    code: 'SIGNUP_TOKEN_INVALID',
    message: 'Liên kết đăng ký không hợp lệ hoặc đã hết hạn. Hãy đăng ký lại để nhận liên kết mới.',
  });
const taken = () =>
  new ConflictException({
    code: 'SIGNUP_EMAIL_TAKEN',
    message: 'Email này đã có tài khoản. Đăng nhập hoặc dùng “Quên mật khẩu?”.',
  });

/**
 * AUTH-04. Sign-up is email-first: step 1 mails a one-time link and always gets the same answer,
 * with lookup and delivery after the response, so neither tells whether the address has an
 * account. Step 2 (from the link) chooses name, role and password and creates an ACTIVE account,
 * so only the mailbox owner ever sets the password. Admin accounts are never self-registered.
 */
@Injectable()
export class SignupService {
  /** Deliveries still in flight; tests await them, production never needs to. */
  readonly pending = new Set<Promise<void>>();
  constructor(
    private readonly db: DatabaseService,
    private readonly limiter: LoginRateLimiter,
    private readonly mailer: Mailer,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfiguration,
  ) {}

  async request(email: string, ip: string) {
    if (!this.mailer.enabled)
      throw new ServiceUnavailableException({
        code: 'SIGNUP_UNAVAILABLE',
        message:
          'Hệ thống chưa gửi được thư xác nhận. Liên hệ quản trị viên để được cấp tài khoản.',
      });
    await this.limiter.checkSignup(ip, `request:${email}`);
    const work = this.deliver(email).catch(() => {
      Logger.warn('Sign-up request could not be completed.', 'Auth');
    });
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work));
  }

  private async deliver(email: string) {
    const token = randomBytes(32).toString('base64url');
    const existing = await this.db.$transaction(async (tx) => {
      const found = await tx.users.findUnique({ where: { email }, select: { status: true } });
      if (found) return found;
      // Only the newest link works.
      await tx.$executeRaw`UPDATE hucescholar.signup_tokens SET used_at=greatest(clock_timestamp(), created_at) WHERE email=${email} AND used_at IS NULL`;
      await tx.signup_tokens.create({
        data: {
          email,
          token_hash: tokenHash(token),
          expires_at: new Date(Date.now() + SIGNUP_TOKEN_TTL_MS),
        },
      });
      return null;
    });
    if (existing) {
      // The owner learns the address is already registered; a locked account stays with the admin.
      if (existing.status !== 'ACTIVE') return;
      await this.mailer.send({
        to: email,
        subject: 'Bạn đã có tài khoản HUCEScholar',
        text: [
          'Chào bạn,',
          '',
          'Có yêu cầu đăng ký HUCEScholar bằng email này, nhưng email đã có tài khoản.',
          `Đăng nhập tại ${this.config.origin}/login. Nếu quên mật khẩu, dùng “Quên mật khẩu?” ở trang đăng nhập.`,
          '',
          'Nếu bạn không yêu cầu, hãy bỏ qua thư này; tài khoản của bạn không thay đổi.',
        ].join('\n'),
      });
      return;
    }
    // The token travels in the fragment, so it never reaches server logs or a Referer header.
    const link = `${this.config.origin}/signup/complete#token=${token}`;
    await this.mailer.send({
      to: email,
      subject: 'Xác nhận đăng ký HUCEScholar',
      text: [
        'Chào bạn,',
        '',
        'Mở liên kết dưới đây trong 24 giờ để hoàn tất đăng ký: nhập tên, chọn vai trò sinh viên hoặc giảng viên và đặt mật khẩu.',
        '',
        link,
        '',
        'Liên kết chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua thư này; sẽ không có tài khoản nào được tạo.',
      ].join('\n'),
    });
  }

  async complete(
    token: string,
    data: { displayName: string; role: SignupRole; password: string },
    ip: string,
  ) {
    // Per address and per link: one visitor's attempts never block another's.
    await this.limiter.checkSignup(ip, `complete:${token}`);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalid();
    try {
      const hash = await argon2.hash(data.password, passwordOptions);
      await this.db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ email: string }[]>`
          SELECT email FROM hucescholar.signup_tokens
          WHERE token_hash=${tokenHash(token)} AND used_at IS NULL AND expires_at > clock_timestamp()
          FOR UPDATE`;
        if (!rows.length) throw invalid();
        const email = rows[0].email;
        await tx.$executeRaw`UPDATE hucescholar.signup_tokens SET used_at=greatest(clock_timestamp(), created_at) WHERE email=${email} AND used_at IS NULL`;
        if (await tx.users.findUnique({ where: { email }, select: { id: true } })) throw taken();
        const user = await tx.users.create({
          data: {
            email,
            display_name: data.displayName,
            password_hash: hash,
            role: data.role,
            status: 'ACTIVE',
            verified_at: new Date(),
            must_change_password: false,
          },
          select: { id: true },
        });
        await tx.audit_events.create({
          data: {
            actor_id: user.id,
            entity_type: 'USER',
            entity_id: user.id,
            event_type: 'ACCOUNT_SELF_REGISTERED',
          },
        });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // A concurrent completion for the same address loses on the unique email.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw taken();
      // ORM diagnostics may contain token or password hashes.
      throw new ServiceUnavailableException(
        'Đăng ký tạm thời gián đoạn. Chưa xác nhận kết quả; thử đăng nhập hoặc đăng ký lại.',
      );
    }
  }
}
