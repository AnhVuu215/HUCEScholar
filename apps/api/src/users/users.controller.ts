import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles, RolesGuard, SessionGuard } from '../auth/session.guard';
import {
  CreateUserDto,
  ListUsersDto,
  ResetPasswordDto,
  UpdateUserDto,
  UserStatusDto,
} from './users.dto';
import { UsersService } from './users.service';

@Controller('admin/users')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get() list(@Query() query: ListUsersDto) {
    return this.users.list(query);
  }
  @Get(':id') get(@Param('id') id: string) {
    return this.users.get(id);
  }
  @Post() create(@Req() request: AuthenticatedRequest, @Body() body: CreateUserDto) {
    return this.users.create(request.user.id, body);
  }
  @Patch(':id') update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
  ) {
    return this.users.update(request.user.id, id, body);
  }
  @Post(':id/password')
  @HttpCode(200)
  resetPassword(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ResetPasswordDto,
  ) {
    return this.users.resetPassword(request.user.id, id, body);
  }
  @Patch(':id/status') status(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UserStatusDto,
  ) {
    return this.users.setStatus(request.user.id, id, body);
  }
}
