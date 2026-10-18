import { Body, Controller, Get, Patch, Put, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { AccountService } from './account.service';
import { PreferencesUpdateDto, ProfileUpdateDto } from './account.dto';
@Controller('account')
@UseGuards(SessionGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}
  @Get('profile') profile(@Req() request: AuthenticatedRequest) {
    return this.account.profile(request);
  }
  @Patch('profile') update(@Req() request: AuthenticatedRequest, @Body() body: ProfileUpdateDto) {
    return this.account.profile(request, body);
  }
  @Get('preferences') preferences(@Req() request: AuthenticatedRequest) {
    return this.account.preferences(request);
  }
  @Put('preferences') savePreferences(
    @Req() request: AuthenticatedRequest,
    @Body() body: PreferencesUpdateDto,
  ) {
    return this.account.preferences(request, body);
  }
}
