import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import {
  CalendarDetachDto,
  CalendarDoneDto,
  CalendarExportDto,
  CalendarOccurrenceDto,
  CalendarRangeDto,
  CalendarRevisionDto,
  CalendarTasksDto,
  CreateCalendarItemDto,
  UpdateCalendarItemDto,
} from './calendar.dto';
import { CalendarService } from './calendar.service';

@Controller('calendar')
@UseGuards(SessionGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}
  @Get('items') range(@Req() req: AuthenticatedRequest, @Query() query: CalendarRangeDto) {
    return this.calendar.range(req.user, query);
  }
  /** CAL-05. A one-off download; no subscription link or token. */
  @Get('export') async export(
    @Req() req: AuthenticatedRequest,
    @Query() query: CalendarExportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.calendar.exportIcs(req.user, query);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="hucescholar-lich-hoc.ics"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return file;
  }
  @Get('tasks') tasks(@Req() req: AuthenticatedRequest, @Query() query: CalendarTasksDto) {
    return this.calendar.tasks(req.user, query);
  }
  @Post('items') create(@Req() req: AuthenticatedRequest, @Body() body: CreateCalendarItemDto) {
    return this.calendar.create(req.user, body);
  }
  @Patch('items/:itemId') update(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Body() body: UpdateCalendarItemDto,
  ) {
    return this.calendar.update(req.user, itemId, body);
  }
  @Put('items/:itemId/done') setDone(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Body() body: CalendarDoneDto,
  ) {
    return this.calendar.setDone(req.user, itemId, body);
  }
  @Post('items/:itemId/skip') @HttpCode(204) skip(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Body() body: CalendarOccurrenceDto,
  ) {
    return this.calendar.skip(req.user, itemId, body);
  }
  @Post('items/:itemId/detach') detach(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Body() body: CalendarDetachDto,
  ) {
    return this.calendar.detach(req.user, itemId, body);
  }
  @Delete('items/:itemId') @HttpCode(204) remove(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Body() body: CalendarRevisionDto,
  ) {
    return this.calendar.remove(req.user, itemId, body);
  }
}
