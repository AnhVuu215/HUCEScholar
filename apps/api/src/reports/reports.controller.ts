import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles, RolesGuard, SessionGuard } from '../auth/session.guard';
import { CreateReportDto, ReportActionDto, ReportListDto } from './reports.dto';
import { ReportsService } from './reports.service';

@Controller('library/versions/:id/reports')
@UseGuards(SessionGuard)
export class VersionReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Post() create(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: CreateReportDto,
  ) {
    return this.reports.create(req.user, id, body);
  }
  @Get('mine') mine(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reports.mine(req.user, id);
  }
}

@Controller('admin/reports')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get() list(@Query() query: ReportListDto) {
    return this.reports.list(query);
  }
  @Get(':id') get(@Param('id') id: string) {
    return this.reports.get(id);
  }
  @Post(':id/actions') act(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ReportActionDto,
  ) {
    return this.reports.act(req.user, id, body);
  }
}
