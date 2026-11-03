import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { once } from 'node:events';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { MAX_PAGE_BYTES } from './notebook-content';
import { readCapped } from './read-capped';
import { NotebookAssetsService } from './notebook-assets.service';
import {
  AddQuotesDto,
  AssetStatusDto,
  AssetVariantDto,
  CreateNotebookDto,
  CreatePageDto,
  DuplicateNotebookDto,
  ImageUrlDto,
  NotebookListDto,
  NotebookRevisionDto,
  ReorderPagesDto,
  UpdateNotebookDto,
  UpdatePageDto,
} from './notebooks.dto';
import { NotebooksService } from './notebooks.service';

/** The page body type: kept apart from `application/json` so the 64 KB JSON parser skips it. */
export const PAGE_CONTENT_TYPE = 'application/vnd.hucescholar.page+json';

@Controller()
@UseGuards(SessionGuard)
export class NotebooksController {
  constructor(
    private readonly notebooks: NotebooksService,
    private readonly assets: NotebookAssetsService,
  ) {}

  @Get('notebooks') list(@Req() req: AuthenticatedRequest, @Query() query: NotebookListDto) {
    return this.notebooks.list(req.user, query);
  }
  @Post('notebooks') create(@Req() req: AuthenticatedRequest, @Body() body: CreateNotebookDto) {
    return this.notebooks.create(req.user, body);
  }
  @Get('notebooks/usage') usage(@Req() req: AuthenticatedRequest) {
    return this.assets.usage(req.user);
  }
  @Get('notebooks/:id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.notebooks.get(req.user, id);
  }
  @Patch('notebooks/:id') update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateNotebookDto,
  ) {
    return this.notebooks.update(req.user, id, body);
  }
  @Delete('notebooks/:id') @HttpCode(204) trash(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: NotebookRevisionDto,
  ) {
    return this.notebooks.trash(req.user, id, body);
  }
  @Post('notebooks/:id/restore') @HttpCode(200) restore(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.notebooks.restore(req.user, id);
  }
  @Delete('notebooks/:id/permanent') @HttpCode(204) purge(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.notebooks.purge(req.user, id);
  }
  @Post('notebooks/:id/duplicate') duplicate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: DuplicateNotebookDto,
  ) {
    return this.notebooks.duplicate(req.user, id, body);
  }
  @Post('notebooks/:id/quotes') addQuotes(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: AddQuotesDto,
  ) {
    return this.notebooks.addQuotes(req.user, id, body);
  }
  @Post('notebooks/:id/pages') createPage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: CreatePageDto,
  ) {
    return this.notebooks.createPage(req.user, id, body);
  }
  @Post('notebooks/:id/pages/reorder') @HttpCode(200) reorder(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ReorderPagesDto,
  ) {
    return this.notebooks.reorder(req.user, id, body);
  }
  @Get('notebooks/:id/pages/:pageId') getPage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('pageId') pageId: string,
  ) {
    return this.notebooks.getPage(req.user, id, pageId);
  }
  /**
   * Autosave. The body is the page document (`application/vnd.hucescholar.page+json`, ≤ 2 MB);
   * `If-Match: "<revision>"` names the revision the editor started from.
   */
  @Put('notebooks/:id/pages/:pageId/content') async savePage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('pageId') pageId: string,
  ) {
    if (
      (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== PAGE_CONTENT_TYPE
    )
      throw new UnsupportedMediaTypeException(`Gửi trang dạng ${PAGE_CONTENT_TYPE}.`);
    const match = /^"([1-9]\d{0,9})"$/.exec(req.headers['if-match'] ?? '');
    if (!match || Number(match[1]) > 2147483646)
      throw new BadRequestException({
        code: 'INVALID_REVISION',
        message: 'Thiếu revision hợp lệ.',
      });
    const body = await readCapped(req, MAX_PAGE_BYTES);
    if (!body)
      throw new PayloadTooLargeException({
        code: 'NOTEBOOK_PAGE_TOO_LARGE',
        message: 'Trang quá lớn (tối đa 2 MB). Chia bớt nội dung sang trang mới.',
      });
    return this.notebooks.savePage(req.user, id, pageId, Number(match[1]), body.toString('utf8'));
  }
  @Patch('notebooks/:id/pages/:pageId') updatePage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('pageId') pageId: string,
    @Body() body: UpdatePageDto,
  ) {
    return this.notebooks.updatePage(req.user, id, pageId, body);
  }
  @Delete('notebooks/:id/pages/:pageId') deletePage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('pageId') pageId: string,
    @Body() body: NotebookRevisionDto,
  ) {
    return this.notebooks.deletePage(req.user, id, pageId, body);
  }

  // ---- Images --------------------------------------------------------------------------------

  /** The body is the image (`image/*`, ≤ 10 MB); `X-Upload-Id` is the idempotency key. */
  @Post('notebook-assets') upload(@Req() req: AuthenticatedRequest) {
    return this.assets.upload(
      req.user,
      req.get('X-Upload-Id'),
      req.headers['content-type'] ?? '',
      req,
    );
  }
  @Post('notebook-assets/from-url') fromUrl(
    @Req() req: AuthenticatedRequest,
    @Body() body: ImageUrlDto,
  ) {
    return this.assets.fromUrl(req.user, body.requestId, body.url);
  }
  @Get('notebook-assets') status(@Req() req: AuthenticatedRequest, @Query() query: AssetStatusDto) {
    return this.assets.status(req.user, query.ids);
  }
  @Get('notebook-assets/:id') async image(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: AssetVariantDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const stream = await this.assets.open(req.user, id, query.size === 'thumb');
    const disconnect = () => stream.destroy();
    response.once('close', disconnect);
    stream.once('close', () => response.off('close', disconnect));
    if ('pending' in stream && stream.pending) await once(stream, 'open');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(stream, { type: 'image/webp', disposition: 'inline' });
  }
}
