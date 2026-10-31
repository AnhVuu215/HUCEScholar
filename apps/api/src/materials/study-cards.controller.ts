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
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import {
  CreateStudyCardDto,
  StudyCardListDto,
  StudyCardRevisionDto,
  StudyCardScopeDto,
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
