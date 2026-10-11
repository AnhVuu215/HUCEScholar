import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles, RolesGuard, SessionGuard } from '../auth/session.guard';
import { CreateCatalogDto, ListCatalogDto, UpdateCatalogDto } from './academic.dto';
import { AcademicService } from './academic.service';

@Controller('admin/catalog')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
export class AcademicController {
  constructor(private readonly academic: AcademicService) {}
  @Get(':kind') list(@Param('kind') kind: string, @Query() query: ListCatalogDto) {
    return this.academic.list(kind, query);
  }
  @Get(':kind/:id') get(@Param('kind') kind: string, @Param('id') id: string) {
    return this.academic.get(kind, id);
  }
  @Post(':kind') create(
    @Req() req: AuthenticatedRequest,
    @Param('kind') kind: string,
    @Body() body: CreateCatalogDto,
  ) {
    return this.academic.create(req.user.id, kind, body);
  }
  @Patch(':kind/:id') update(
    @Req() req: AuthenticatedRequest,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: UpdateCatalogDto,
  ) {
    return this.academic.update(req.user.id, kind, id, body);
  }
}
