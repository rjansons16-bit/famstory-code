import { Controller, Get, HttpCode, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { originOf } from '../../common/origin';
import { RateLimit } from '../../common/rate-limit.guard';
import { CurrentUser, Public, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { VisibilityService } from '../visibility/visibility.service';
import { CalendarService } from './calendar.service';

/** The member's own feed address: to show it, and to replace it. */
@Controller('v1/families/:familyId/calendar-feed')
export class CalendarFeedController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly visibility: VisibilityService,
  ) {}

  @Get()
  async show(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Req() req: Request,
  ) {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    return this.calendar.feedFor(ctx, originOf(req));
  }

  @HttpCode(200)
  @Post('reset')
  async reset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Req() req: Request,
  ) {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    return this.calendar.reset(ctx, originOf(req));
  }
}

/**
 * What the calendar app fetches. Public - a calendar has no session - and
 * authorised by the signed address instead (calendar.service.ts).
 */
@Controller('v1/calendar')
export class CalendarFileController {
  constructor(private readonly calendar: CalendarService) {}

  @RateLimit({ ip: { limit: 60, windowSec: 300 } })
  @Public()
  @Get(':file')
  async file(@Param('file') file: string, @Res() res: Response): Promise<void> {
    const text = await this.calendar.render(file);
    if (text === null) {
      // One answer for a wrong signature, an old version and a member who has
      // gone: from outside they must look the same.
      throw new NotFoundException({ code: 'not_found', message: 'Not found.' });
    }

    res
      .status(200)
      .setHeader('Content-Type', 'text/calendar; charset=utf-8')
      .setHeader('Content-Disposition', 'inline; filename="famstory.ics"')
      // One family's week: never kept by anything between here and the phone.
      .setHeader('Cache-Control', 'private, max-age=300')
      .send(text);
  }
}
