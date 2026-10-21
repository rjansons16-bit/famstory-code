import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { VisibilityService } from '../visibility/visibility.service';
import { ReportsService, type ReportInput } from './reports.service';

@Controller('v1/families/:familyId')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly visibility: VisibilityService,
  ) {}

  /** `{ target: 'event' | 'comment', id, reason, note? }` - docs/05-API.md, Reports. */
  @HttpCode(201)
  @Post('reports')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Body() dto: ReportInput,
  ) {
    return this.reports.create(await this.visibility.contextFor(user.id, familyId), dto ?? {});
  }
}
