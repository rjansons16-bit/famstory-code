import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { CurrentUser, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { VisibilityService } from '../visibility/visibility.service';
import { MediaService } from './media.service';

/**
 * Media endpoints. See docs/05-API.md.
 *
 * The route sits under `/families/:familyId` like every other resource: there
 * is no endpoint in this API that returns data without a family context.
 */
@Controller('v1/families/:familyId')
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly visibility: VisibilityService,
  ) {}

  @Get('attachments/:attachmentId/url')
  async url(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('attachmentId') attachmentId: string,
    @Req() req: Request,
    @Query('variant') variant?: string,
  ) {
    const ctx = await this.visibility.contextFor(user.id, familyId);

    // The URL is built against the address the client just used, so a link
    // works from the LAN, from a tunnel and from a domain without the server
    // having to be told which one it is behind.
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0] : req.protocol;
    const baseUrl = `${protocol}://${req.headers.host ?? 'localhost'}`;

    return this.media.urlFor(ctx, attachmentId, variant === 'thumb' ? 'thumb' : 'original', baseUrl);
  }
}
