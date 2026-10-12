import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles, RolesGuard, SessionGuard } from '../auth/session.guard';
import { DraftListDto } from './materials.dto';
import { LifecycleListDto, MaterialVisibilityDto, TransferMaterialDto } from './lifecycle.dto';
import { LifecycleService } from './lifecycle.service';
@Controller('admin/materials')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
export class LifecycleController {
  constructor(private readonly lifecycle: LifecycleService) {}
  @Get() list(@Query() query: LifecycleListDto) {
    return this.lifecycle.list(query);
  }
  @Get(':id/recipients') recipients(@Param('id') id: string, @Query() query: DraftListDto) {
    return this.lifecycle.recipients(id, query);
  }
  @Get(':id') get(@Param('id') id: string, @Query() query: DraftListDto) {
    return this.lifecycle.get(id, query);
  }
  @Post(':id/transfer') transfer(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: TransferMaterialDto,
  ) {
    return this.lifecycle.transfer(req.user, id, body);
  }
  @Post(':id/visibility') visibility(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: MaterialVisibilityDto,
  ) {
    return this.lifecycle.visibility(req.user, id, body);
  }
}
