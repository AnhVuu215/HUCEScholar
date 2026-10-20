import { AnnotationSearchDto } from './annotation-search.dto';
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
import { CsrfGuard } from '../auth/csrf.guard';
import {
  CreateNoteDto,
  NotesQueryDto,
  ReadingRevisionDto,
  SaveProgressDto,
  UpdateNoteDto,
} from './reading.dto';
import { ReadingService } from './reading.service';
import { CreateHighlightDto, UpdateHighlightDto } from './highlight.dto';
@Controller('library/versions/:id')
@UseGuards(SessionGuard, CsrfGuard)
export class ReadingController {
  constructor(private readonly reading: ReadingService) {}
  @Post('annotations/search') search(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AnnotationSearchDto,
  ) {
    return this.reading.search(req.user, id, dto);
  }
  @Get('highlights') highlights(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: NotesQueryDto,
  ) {
    return this.reading.highlights(req.user, id, query);
  }
  @Post('highlights') createHighlight(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateHighlightDto,
  ) {
    return this.reading.createHighlight(req.user, id, dto);
  }
  @Patch('highlights/:noteId') updateHighlight(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateHighlightDto,
  ) {
    return this.reading.updateHighlight(req.user, id, noteId, dto);
  }
  @Delete('highlights/:noteId') @HttpCode(204) removeHighlight(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() dto: ReadingRevisionDto,
  ) {
    return this.reading.remove(req.user, id, noteId, dto, 'TEXT_HIGHLIGHT');
  }
  @Get('notes') notes(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: NotesQueryDto,
  ) {
    return this.reading.notes(req.user, id, query);
  }
  @Post('notes') create(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.reading.create(req.user, id, dto);
  }
  @Patch('notes/:noteId') update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.reading.update(req.user, id, noteId, dto);
  }
  @Delete('notes/:noteId') @HttpCode(204) remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() dto: ReadingRevisionDto,
  ) {
    return this.reading.remove(req.user, id, noteId, dto);
  }
  @Get('progress') progress(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reading.progress(req.user, id);
  }
  @Put('progress') saveProgress(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SaveProgressDto,
  ) {
    return this.reading.saveProgress(req.user, id, dto);
  }
}
