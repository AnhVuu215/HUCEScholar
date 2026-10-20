import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthenticatedRequest, Role } from './auth.types';

const rolesKey = 'allowedRoles';
export const Roles = (...roles: Role[]) => SetMetadata(rolesKey, roles);
const pendingPasswordKey = 'allowPendingPasswordChange';
/** Routes an account with an admin-issued password may still use: profile read and the change itself. */
export const AllowPendingPasswordChange = () => SetMetadata(pendingPasswordKey, true);

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.auth.authenticate(request);
    if (
      request.user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(pendingPasswordKey, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Đổi mật khẩu được cấp trước khi tiếp tục.',
      });
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const allowed = this.reflector.getAllAndOverride<Role[]>(rolesKey, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (
      !allowed ||
      allowed.includes(context.switchToHttp().getRequest<AuthenticatedRequest>().user.role)
    )
      return true;
    throw new ForbiddenException('Bạn không có quyền truy cập khu vực này.');
  }
}
