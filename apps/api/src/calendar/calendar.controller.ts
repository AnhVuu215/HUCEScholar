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
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import {
  CalendarDoneDto,
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
  @Delete('items/:itemId') @HttpCode(204) remove(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Body() body: CalendarRevisionDto,
  ) {
    return this.calendar.remove(req.user, itemId, body);
  }
}
