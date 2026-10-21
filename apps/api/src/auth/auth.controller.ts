import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CsrfGuard } from './csrf.guard';
import { AuthenticatedRequest } from './auth.types';
import { AllowPendingPasswordChange, SessionGuard } from './session.guard';
import { ChangePasswordDto, ResetPasswordDto } from './change-password.dto';
import { RecoveryService } from './recovery.service';

class RecoveryRequestDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
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
