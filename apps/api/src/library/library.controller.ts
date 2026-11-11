import { Controller, Get, Headers, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { LibraryListDto } from './library.dto';
import { LibraryService } from './library.service';
@Controller('library')
@UseGuards(SessionGuard)
export class LibraryController {
  constructor(private readonly library: LibraryService) {}
  @Get() list(@Query() query: LibraryListDto) {
    return this.library.list(query);
  }
  @Get('courses') courses() {
    return this.library.courses();
  }
  @Get('versions/:id') get(@Param('id') id: string) {
    return this.library.get(id);
  }
  @Get('versions/:id/pdf') pdf(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.library.file(req.user, id, false, range, res);
  }
  @Get('versions/:id/download') download(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.library.file(req.user, id, true, range, res);
  }
  @Get('versions/:id/source-download') sourceDownload(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.library.file(req.user, id, true, range, res, true);
  }
}
