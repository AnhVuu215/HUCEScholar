import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CsrfGuard } from './csrf.guard';
import { AuthenticatedRequest } from './auth.types';
import { AllowPendingPasswordChange, SessionGuard } from './session.guard';
import { ChangePasswordDto, ResetPasswordDto, utf16Bound } from './change-password.dto';
import { RecoveryService } from './recovery.service';
import { SignupService, type SignupRole } from './signup.service';

class RecoveryRequestDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

class SignupCompleteDto {
  @IsString() @MinLength(1) @MaxLength(64) token!: string;
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  displayName!: string;
  /** Admin accounts are only ever issued by an administrator. */
  @IsIn(['STUDENT', 'LECTURER']) role!: SignupRole;
  @IsString() @MinLength(16) @utf16Bound() password!: string;
}

class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly csrf: CsrfGuard,
    private readonly recovery: RecoveryService,
    private readonly signup: SignupService,
  ) {}
  @Get('csrf') csrfToken(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return { csrfToken: this.csrf.issue(request, response) };
  }
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return { user: await this.auth.login(body.email, body.password, request, response) };
  }
  /** Same 202 whether or not the address has an account. */
  @Post('password-recovery')
  @HttpCode(202)
  async requestRecovery(@Body() body: RecoveryRequestDto, @Req() request: Request) {
    await this.recovery.request(body.email, request.ip ?? '');
    return {
      message:
        'Nếu email thuộc một tài khoản đang hoạt động, thư hướng dẫn sẽ đến trong vài phút. Liên kết hết hạn sau 30 phút.',
    };
  }
  @Post('password-recovery/complete')
  @HttpCode(204)
  async completeRecovery(@Body() body: ResetPasswordDto, @Req() request: Request) {
    await this.recovery.complete(body.token, body.newPassword, request.ip ?? '');
  }
  /** AUTH-04 step 1. Same 202 whether or not the address already has an account. */
  @Post('signup')
  @HttpCode(202)
  async requestSignup(@Body() body: RecoveryRequestDto, @Req() request: Request) {
    await this.signup.request(body.email, request.ip ?? '');
    return {
      message:
        'Đã nhận yêu cầu. Thư xác nhận sẽ đến email này trong vài phút; liên kết hết hạn sau 24 giờ.',
    };
  }
  /** AUTH-04 step 2, from the mailed link: creates the account; the user then signs in. */
  @Post('signup/complete')
  @HttpCode(204)
  async completeSignup(@Body() body: SignupCompleteDto, @Req() request: Request) {
    await this.signup.complete(
      body.token,
      { displayName: body.displayName, role: body.role, password: body.password },
      request.ip ?? '',
    );
  }
  @Get('me')
  @UseGuards(SessionGuard)
  @AllowPendingPasswordChange()
  me(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request, response);
  }
  @Post('change-password')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  @AllowPendingPasswordChange()
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.changePassword(
      request.user.id,
      body.currentPassword,
      body.newPassword,
      request,
      response,
    );
  }
}
