import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles, RolesGuard, SessionGuard } from '../auth/session.guard';
import { DraftFieldsDto, DraftListDto, UpdateDraftDto } from './materials.dto';
import { MaterialsService } from './materials.service';
@Controller('material-drafts')
@UseGuards(SessionGuard, RolesGuard)
@Roles('LECTURER', 'STUDENT')
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}
  @Get('courses') courses(@Req() req: AuthenticatedRequest, @Query() query: DraftListDto) {
    return this.materials.courses(req.user, query);
  }
  @Get() list(@Req() req: AuthenticatedRequest, @Query() query: DraftListDto) {
    return this.materials.list(req.user, query);
  }
  @Get(':id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.materials.get(req.user, id);
  }
  @Post() create(@Req() req: AuthenticatedRequest, @Body() body: DraftFieldsDto) {
    return this.materials.create(req.user, body);
  }
  @Patch(':id') update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateDraftDto,
  ) {
    return this.materials.update(req.user, id, body);
  }
}
