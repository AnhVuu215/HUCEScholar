import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
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
import { NotebookExportDto, NotebookSearchDto } from './annotation-search.dto';
import { PersonalListDto, SaveDocumentDto } from './personal-library.dto';
import { PersonalLibraryService } from './personal-library.service';
@Controller('personal-library')
@UseGuards(SessionGuard)
export class PersonalLibraryController {
  constructor(private readonly library: PersonalLibraryService) {}
  @Get('saved') saved(@Req() req: AuthenticatedRequest, @Query() query: PersonalListDto) {
    return this.library.saved(req.user, query);
  }
  @Get('recent') recent(@Req() req: AuthenticatedRequest, @Query() query: PersonalListDto) {
    return this.library.recent(req.user, query);
  }
  @Get('review-later') reviewLater(
    @Req() req: AuthenticatedRequest,
    @Query() query: PersonalListDto,
  ) {
    return this.library.reviewLater(req.user, query);
  }
  @Get('notebook/courses') notebookCourses(@Req() req: AuthenticatedRequest) {
    return this.library.notebookCourses(req.user);
  }
  @Post('notebook/search') notebook(
    @Req() req: AuthenticatedRequest,
    @Body() body: NotebookSearchDto,
  ) {
    return this.library.notebook(req.user, body);
  }
  /** EXPORT-02. POST so the search text stays out of URLs and logs, like the search itself. */
  @Post('notebook/export') @HttpCode(200) async notebookExport(
    @Req() req: AuthenticatedRequest,
    @Body() body: NotebookExportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.library.notebookExport(req.user, body);
    const markdown = body.format === 'markdown';
    res.setHeader(
      'Content-Type',
      markdown ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="so-tay-ghi-chu.${markdown ? 'md' : 'txt'}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return file;
  }
  @Get('saved/:id') status(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.library.status(req.user, id);
  }
  @Put('saved/:id') save(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SaveDocumentDto,
  ) {
    return this.library.change(req.user, id, body.saved);
  }
  @Delete('saved/:id') remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.library.change(req.user, id, false);
  }
}
