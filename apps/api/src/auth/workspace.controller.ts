import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from './auth.types';
import { Roles, RolesGuard, SessionGuard } from './session.guard';

@Controller('workspace')
@UseGuards(SessionGuard, RolesGuard)
export class WorkspaceController {
  @Get('admin')
  @Roles('ADMIN')
  admin(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }
  @Get('lecturer')
  @Roles('LECTURER')
  lecturer(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }
  @Get('student')
  @Roles('STUDENT')
  student(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }
}
