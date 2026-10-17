import {
  Body,
  Controller,
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
import { Roles, RolesGuard, SessionGuard } from '../auth/session.guard';
import {
  DraftFieldsDto,
  DraftListDto,
  MaterialListDto,
  MaterialHistoryDto,
  SubmitMaterialDto,
  WithdrawMaterialDto,
  UpdateDraftDto,
  SourceRetryDto,
} from './materials.dto';
import { MaterialsService } from './materials.service';
import { DraftPdfService } from './draft-pdf.service';
import { SourceUploadService } from './source-upload.service';
import { DOCX_MIME } from '../files/receive-docx';
import { LibraryService } from './library.service';
@Controller('material-drafts')
@UseGuards(SessionGuard, RolesGuard)
@Roles('LECTURER', 'STUDENT')
export class MaterialsController {
  constructor(
    private readonly materials: MaterialsService,
    private readonly pdf: DraftPdfService,
    private readonly source: SourceUploadService,
    private readonly library: LibraryService,
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
  @Post(':id/file')
  @HttpCode(202)
  @Roles('LECTURER')
  uploadFile(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return req.get('Content-Type')?.split(';')[0].trim().toLowerCase() === DOCX_MIME
      ? this.source.upload(req.user, id, req)
      : this.pdf.upload(req.user, id, req);
  }
  @Post(':id/source/retry')
  @HttpCode(202)
  @Roles('LECTURER')
  retrySource(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SourceRetryDto,
  ) {
    return this.source.retry(req.user, id, body);
  }
  @Get(':id/preview')
  @Roles('LECTURER')
  preview(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.library.draftPreview(req.user, id, res);
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
