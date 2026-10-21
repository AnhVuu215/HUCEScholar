import { Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { NotificationListDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() list(@Req() req: AuthenticatedRequest, @Query() query: NotificationListDto) {
    return this.notifications.list(req.user, query);
  }
  @Get('unread') unread(@Req() req: AuthenticatedRequest) {
    return this.notifications.unread(req.user);
  }
  @Post('read-all') @HttpCode(200) readAll(@Req() req: AuthenticatedRequest) {
    return this.notifications.readAll(req.user);
  }
  @Post(':id/read') @HttpCode(200) read(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.notifications.read(req.user, id);
  }
}
