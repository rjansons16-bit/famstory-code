import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { RateLimit } from '../../common/rate-limit.guard';
import { VisibilityService } from '../visibility/visibility.service';
import { CurrentUser, Public, type AuthenticatedUser } from './jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';

/**
 * Making a reset link, checking one, and using one. See password-reset.service.ts
 * for what this is and the three things that keep it from being quiet.
 */
@Controller('v1')
export class PasswordResetController {
  constructor(
    private readonly resets: PasswordResetService,
    private readonly visibility: VisibilityService,
  ) {}

  /** An admin, for another adult in the same family. */
  @Post('families/:familyId/members/:memberId/password-reset')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
    @Req() req: Request,
  ) {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    return this.resets.createForMember(ctx, memberId, originOf(req));
  }

  /**
   * What "forgot your password?" can offer on this server: a link by email,
   * or - without a mail provider, as on the LAN host - the family admin's.
   */
  @Public()
  @Get('auth/password-reset')
  options() {
    return { byEmail: this.resets.emailAvailable };
  }

  /**
   * "Forgot your password?": a link to the address, if it has an account.
   * 202 either way - see requestByEmail. Five tries a quarter of an hour from
   * one address; the service adds one email per account per five minutes.
   */
  @RateLimit({ ip: { limit: 5, windowSec: 900 } })
  @Public()
  @HttpCode(202)
  @Post('auth/password-reset/request')
  async request(@Body() dto: { email?: unknown }): Promise<{ sent: true }> {
    await this.resets.requestByEmail(dto?.email);
    return { sent: true };
  }

  /**
   * Is this link still good. Public - the person holding it cannot sign in,
   * which is the whole reason they have it - and rate-limited, because a
   * public endpoint that answers "valid or not" is otherwise a way to guess.
   */
  @RateLimit({ ip: { limit: 20, windowSec: 900 } })
  @Public()
  @Get('auth/password-reset/:token')
  check(@Param('token') token: string) {
    return this.resets.check(token);
  }

  @RateLimit({ ip: { limit: 10, windowSec: 900 } })
  @Public()
  @HttpCode(204)
  @Post('auth/password-reset')
  async complete(@Body() dto: { token: string; password: string }): Promise<void> {
    await this.resets.complete(dto.token, dto.password);
  }
}

/** Where this server is reachable, as the admin's app just reached it. */
function originOf(req: Request): string {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0] : req.protocol;
  return `${protocol}://${req.headers.host ?? 'localhost'}`;
}
