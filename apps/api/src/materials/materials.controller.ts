import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles, RolesGuard, SessionGuard } from '../auth/session.guard';
import {
  DraftFieldsDto,
  DraftListDto,
  MaterialListDto,
  MaterialHistoryDto,
  SubmitMaterialDto,
  WithdrawMaterialDto,
  UpdateDraftDto,
} from './materials.dto';
import { MaterialsService } from './materials.service';
import { DraftPdfService } from './draft-pdf.service';
@Controller('material-drafts')
@UseGuards(SessionGuard, RolesGuard)
@Roles('LECTURER', 'STUDENT')
export class MaterialsController {
  constructor(
    private readonly materials: MaterialsService,
    private readonly pdf: DraftPdfService,
  ) {}
  @Post(':id/versions') nextVersion(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SubmitMaterialDto,
  ) {
    return this.materials.nextVersion(req.user, id, body);
  }
  @Get(':id/versions') versions(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: DraftListDto,
  ) {
    return this.materials.versions(req.user, id, query);
  }
  @Post(':id/reopen') reopen(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SubmitMaterialDto,
  ) {
    return this.materials.reopen(req.user, id, body);
  }
  @Post(':id/submit') submit(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SubmitMaterialDto,
  ) {
    return this.materials.submit(req.user, id, body);
  }
  @Post(':id/publish')
  @Roles('LECTURER')
  publish(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SubmitMaterialDto,
  ) {
    return this.materials.publish(req.user, id, body);
  }
  @Post(':id/withdraw') withdraw(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: WithdrawMaterialDto,
  ) {
    return this.materials.withdraw(req.user, id, body);
  }
  @Get(':id/requests') history(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: MaterialHistoryDto,
  ) {
    return this.materials.history(req.user, id, query);
  }
  @Post(':id/pdf') upload(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.pdf.upload(req.user, id, req);
  }
  @Get('courses') courses(@Req() req: AuthenticatedRequest, @Query() query: DraftListDto) {
    return this.materials.courses(req.user, query);
  }
  @Get() list(@Req() req: AuthenticatedRequest, @Query() query: MaterialListDto) {
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
