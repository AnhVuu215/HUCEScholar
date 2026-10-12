import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles, RolesGuard, SessionGuard } from '../auth/session.guard';
import { ModerationDecisionDto, ModerationListDto } from './moderation.dto';
import { ModerationService } from './moderation.service';
@Controller('admin/publication-requests')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}
  @Get() list(@Query() query: ModerationListDto) {
    return this.moderation.list(query);
  }
  @Get(':id') get(@Param('id') id: string) {
    return this.moderation.get(id);
  }
  @Get(':id/pdf') pdf(@Param('id') id: string) {
    return this.moderation.preview(id);
  }
  @Post(':id/decision') decide(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ModerationDecisionDto,
  ) {
    return this.moderation.decide(req.user, id, body);
  }
}
