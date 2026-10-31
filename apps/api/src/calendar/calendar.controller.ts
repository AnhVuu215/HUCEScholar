import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import { MAX_IMPORT_BYTES } from './calendar-ics-import';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import {
  CalendarDetachDto,
  CalendarOccurrenceDoneDto,
  CalendarExportDto,
  CalendarImportDto,
  CalendarOccurrenceDto,
  CalendarRangeDto,
  CalendarRevisionDto,
  CalendarSplitDto,
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
  /** CAL-07. The body is the .ics file itself (text/calendar), at most 512 KB. */
  @Post('import') @HttpCode(200) async import(
    @Req() req: AuthenticatedRequest,
    @Query() query: CalendarImportDto,
  ) {
    if (!/^text\/calendar\b/i.test(req.headers['content-type'] ?? ''))
      throw new UnsupportedMediaTypeException('Gửi file .ics (text/calendar).');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req as unknown as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > MAX_IMPORT_BYTES) throw new PayloadTooLargeException('File lịch lớn hơn 512 KB.');
      chunks.push(chunk);
    }
    return this.calendar.importIcs(
      req.user,
      Buffer.concat(chunks).toString('utf8'),
      query.utcOffset,
    );
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
    @Body() body: CalendarOccurrenceDoneDto,
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
  @Post('items/:itemId/split') split(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Body() body: CalendarSplitDto,
  ) {
    return this.calendar.split(req.user, itemId, body);
  }
  @Post('items/:itemId/truncate') @HttpCode(204) truncate(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Body() body: CalendarOccurrenceDto,
  ) {
    return this.calendar.truncate(req.user, itemId, body);
  }
  @Delete('items/:itemId') @HttpCode(204) remove(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Body() body: CalendarRevisionDto,
  ) {
    return this.calendar.remove(req.user, itemId, body);
  }
}
