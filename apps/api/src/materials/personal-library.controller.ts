import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { NotebookSearchDto } from './annotation-search.dto';
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
