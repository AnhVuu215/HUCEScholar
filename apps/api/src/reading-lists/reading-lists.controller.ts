import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import {
  FollowReadingListsDto,
  ReadingDeadlinesDto,
  SaveReadingListDto,
} from './reading-lists.dto';
import { ReadingListsService } from './reading-lists.service';

@Controller('courses/:courseId/reading-lists')
@UseGuards(SessionGuard)
export class ReadingListsController {
  constructor(private readonly lists: ReadingListsService) {}
  @Get() published(@Req() req: AuthenticatedRequest, @Param('courseId') courseId: string) {
    return this.lists.published(req.user, courseId);
  }
  @Get('mine') mine(@Req() req: AuthenticatedRequest, @Param('courseId') courseId: string) {
    return this.lists.mine(req.user, courseId);
  }
  @Put('mine') save(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
    @Body() body: SaveReadingListDto,
  ) {
    return this.lists.save(req.user, courseId, body);
  }
  @Put('follow') follow(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
    @Body() body: FollowReadingListsDto,
  ) {
    return this.lists.follow(req.user, courseId, body);
  }
}

/** CAL-04b: reading-list due dates for the signed-in reader's own calendar. */
@Controller('calendar/reading-deadlines')
@UseGuards(SessionGuard)
export class ReadingDeadlinesController {
  constructor(private readonly lists: ReadingListsService) {}
  @Get() deadlines(@Req() req: AuthenticatedRequest, @Query() query: ReadingDeadlinesDto) {
    return this.lists.deadlines(req.user, query);
  }
}
