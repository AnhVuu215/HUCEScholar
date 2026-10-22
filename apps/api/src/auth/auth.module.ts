import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard } from './csrf.guard';
import { LoginRateLimiter } from './login-rate-limiter';
import { Mailer } from './mailer';
import { RecoveryService } from './recovery.service';
import { SignupService } from './signup.service';
import { RolesGuard, SessionGuard } from './session.guard';
import { WorkspaceController } from './workspace.controller';

@Module({
  exports: [AuthService, SessionGuard, RolesGuard],
  controllers: [AuthController, WorkspaceController],
  providers: [
    AuthService,
    LoginRateLimiter,
    Mailer,
    RecoveryService,
    SignupService,
    CsrfGuard,
    SessionGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: CsrfGuard },
  ],
})
export class AuthModule {}
