import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import {
  CreateStudyCardDto,
  ReviewStudyCardDto,
  StudyCardExportDto,
  StudyCardListDto,
  StudyCardRevisionDto,
  StudyCardScopeDto,
  StudyScheduleDto,
  UpdateStudyCardDto,
} from './study-cards.dto';
import { StudyCardsService } from './study-cards.service';

@Controller()
@UseGuards(SessionGuard)
export class StudyCardsController {
  constructor(private readonly cards: StudyCardsService) {}
  @Post('library/versions/:id/study-cards') create(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: CreateStudyCardDto,
  ) {
    return this.cards.create(req.user, id, body);
  }
  @Get('study-cards') list(@Req() req: AuthenticatedRequest, @Query() query: StudyCardListDto) {
    return this.cards.list(req.user, query);
  }
  @Get('study-cards/filters') filters(@Req() req: AuthenticatedRequest) {
    return this.cards.filters(req.user);
  }
  @Get('study-cards/practice') practice(
    @Req() req: AuthenticatedRequest,
    @Query() query: StudyCardScopeDto,
  ) {
    return this.cards.practice(req.user, query);
  }
  @Get('study-cards/stats') stats(@Req() req: AuthenticatedRequest) {
    return this.cards.stats(req.user);
  }
  @Get('study-cards/export') async export(
    @Req() req: AuthenticatedRequest,
    @Query() query: StudyCardExportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const body = await this.cards.export(req.user, query);
    const markdown = query.format === 'markdown';
    res.setHeader(
      'Content-Type',
      markdown ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="the-on-tap.${markdown ? 'md' : 'txt'}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    return body;
  }
  @Get('study-cards/due') due(@Req() req: AuthenticatedRequest, @Query() query: StudyCardScopeDto) {
    return this.cards.due(req.user, query);
  }
  @Get('study-cards/schedule') schedule(
    @Req() req: AuthenticatedRequest,
    @Query() query: StudyScheduleDto,
  ) {
    return this.cards.schedule(req.user, query);
  }
  @Post('study-cards/:cardId/review') @HttpCode(200) review(
    @Req() req: AuthenticatedRequest,
    @Param('cardId') cardId: string,
    @Body() body: ReviewStudyCardDto,
  ) {
    return this.cards.review(req.user, cardId, body);
  }
  @Post('study-cards/:cardId/reset-schedule') @HttpCode(200) resetSchedule(
    @Req() req: AuthenticatedRequest,
    @Param('cardId') cardId: string,
  ) {
    return this.cards.resetSchedule(req.user, cardId);
  }
  @Patch('study-cards/:cardId') update(
    @Req() req: AuthenticatedRequest,
    @Param('cardId') cardId: string,
    @Body() body: UpdateStudyCardDto,
  ) {
    return this.cards.update(req.user, cardId, body);
  }
  @Delete('study-cards/:cardId') @HttpCode(204) remove(
    @Req() req: AuthenticatedRequest,
    @Param('cardId') cardId: string,
    @Body() body: StudyCardRevisionDto,
  ) {
    return this.cards.remove(req.user, cardId, body);
  }
}
