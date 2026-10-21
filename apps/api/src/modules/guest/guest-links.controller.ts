import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { originOf } from '../../common/origin';
import { RateLimit } from '../../common/rate-limit.guard';
import { CurrentUser, Public, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { VisibilityService } from '../visibility/visibility.service';
import { GuestLinksService } from './guest-links.service';

/** Making, listing and withdrawing links, from inside the family. */
@Controller('v1/families/:familyId')
export class GuestLinksController {
  constructor(
    private readonly links: GuestLinksService,
    private readonly visibility: VisibilityService,
  ) {}

  @Post('events/:eventId/share-links')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('eventId') eventId: string,
    @Body() dto: { days?: number; heirloom?: boolean },
    @Req() req: Request,
  ) {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    return this.links.create(ctx, eventId, dto?.days, originOf(req), dto?.heirloom === true);
  }

  @Get('events/:eventId/share-links')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.links.listFor(await this.visibility.contextFor(user.id, familyId), eventId);
  }

  @HttpCode(204)
  @Delete('share-links/:linkId')
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('linkId') linkId: string,
  ): Promise<void> {
    await this.links.revoke(await this.visibility.contextFor(user.id, familyId), linkId);
  }
}

/** What the guest's browser asks for. Public, and the token is the permission. */
@Controller('v1/guest')
export class GuestViewController {
  constructor(private readonly links: GuestLinksService) {}

  @RateLimit({ ip: { limit: 30, windowSec: 300 } })
  @Public()
  @Get(':token')
  async open(@Param('token') token: string, @Req() req: Request) {
    const view = await this.links.open(token, originOf(req));
    // One answer for wrong, withdrawn and expired: from outside they are the same.
    if (!view) throw new NotFoundException({ code: 'guest_link_invalid', message: 'This link does not work any more.' });
    return view;
  }
}
