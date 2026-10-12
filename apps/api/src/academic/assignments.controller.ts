import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles, RolesGuard, SessionGuard } from '../auth/session.guard';
import {
  CreateAssignmentDto,
  ListAssignmentsDto,
  OwnAssignmentsDto,
  RevokeAssignmentDto,
} from './assignments.dto';
import { AssignmentsService } from './assignments.service';
@Controller('admin/assignments')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}
  @Get() list(@Query() query: ListAssignmentsDto) {
    return this.assignments.list(query);
  }
  @Post() create(@Req() req: AuthenticatedRequest, @Body() body: CreateAssignmentDto) {
    return this.assignments.create(req.user.id, body);
  }
  @Patch(':id/revoke') revoke(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: RevokeAssignmentDto,
  ) {
    return this.assignments.revoke(req.user.id, id, body);
  }
}
@Controller('lecturer/assignments')
@UseGuards(SessionGuard, RolesGuard)
@Roles('LECTURER')
export class OwnAssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}
  @Get() list(@Req() req: AuthenticatedRequest, @Query() query: OwnAssignmentsDto) {
    return this.assignments.list(query, req.user.id);
  }
}
