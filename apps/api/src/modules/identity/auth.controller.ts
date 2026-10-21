import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { AuthProvider } from '@prisma/client';
import type { Request } from 'express';
import { createHash } from 'node:crypto';

import { LIMITS, requiredText } from '../../common/input';
import { PrismaService } from '../../common/prisma.service';
import { RateLimit } from '../../common/rate-limit.guard';
import { AuthService, termsAccepted, type AuthContext } from './auth.service';
import { CurrentUser, Public, type AuthenticatedUser } from './jwt-auth.guard';
import { OauthVerifier } from './oauth.verifier';

@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OauthVerifier,
  ) {}

  /**
   * Five accounts an hour from one address. A family signs up once; a script
   * filling the database with rows costs a real bucket, real rows and - once
   * email verification exists - real mail.
   */
  @RateLimit({ ip: { limit: 5, windowSec: 3600 } })
  @Public()
  @Post('email/register')
  register(
    @Req() req: Request,
    @Body()
    dto: { email: string; password: string; displayName: string; locale?: string; acceptedTerms?: string },
  ) {
    return this.auth.register(dto, contextFrom(req));
  }

  /**
   * Ten tries in five minutes from one address, and five against one account
   * in fifteen. A person who has forgotten which password they used gets
   * several goes; a script gets nowhere, and a successful sign-in clears the
   * account's count so honest typing never accumulates.
   */
  @RateLimit({
    ip: { limit: 10, windowSec: 300 },
    account: { field: 'email', limit: 5, windowSec: 900 },
  })
  @Public()
  @HttpCode(200)
  @Post('email/login')
  login(@Req() req: Request, @Body() dto: { email: string; password: string }) {
    return this.auth.login(dto, contextFrom(req));
  }

  // A provider token is verified against Google, which is a network call this
  // server pays for. Generous, because one device can legitimately retry.
  @RateLimit({ ip: { limit: 20, windowSec: 300 } })
  @Public()
  @HttpCode(200)
  @Post('google')
  async google(@Req() req: Request, @Body() dto: { idToken: string; acceptedTerms?: string }) {
    const profile = await this.oauth.verifyGoogle(dto.idToken);
    return this.auth.loginWithProvider(AuthProvider.google, profile, contextFrom(req), dto.acceptedTerms);
  }

  @RateLimit({ ip: { limit: 20, windowSec: 300 } })
  @Public()
  @HttpCode(200)
  @Post('apple')
  async apple(
    @Req() req: Request,
    @Body() dto: { identityToken: string; displayName?: string; acceptedTerms?: string },
  ) {
    const profile = await this.oauth.verifyApple(dto.identityToken, dto.displayName);
    return this.auth.loginWithProvider(AuthProvider.apple, profile, contextFrom(req), dto.acceptedTerms);
  }

  /**
   * Refresh is a legitimate, frequent call - every expired access token for
   * every family member behind one home address. The limit is here only so
   * that a stolen refresh token cannot be used to mint tokens in a loop.
   */
  @RateLimit({ ip: { limit: 120, windowSec: 300 } })
  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Req() req: Request, @Body() dto: { refreshToken: string }) {
    return this.auth.refresh(dto.refreshToken, contextFrom(req));
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Body() dto: { refreshToken: string }): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }
}

/** The settings screen's choices, read back with the profile and after a change. */
const PREFERENCES = {
  notifyEvents: true,
  notifyComments: true,
  notifyReminders: true,
  defaultReminderMinutes: true,
} as const;

/** The longest reminder the app offers is a week before (lib/date.ts REMINDER_OPTIONS). */
const LONGEST_REMINDER_MINUTES = 7 * 24 * 60;

export function isReminderOffset(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= LONGEST_REMINDER_MINUTES
  );
}

@Controller('v1/users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  /** The profile plus every family the user is an active member of. */
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        locale: true,
        shareUsageStats: true,
        ...PREFERENCES,
        termsVersion: true,
        termsAcceptedAt: true,
        healthConsentAt: true,
        createdAt: true,
        members: {
          where: { status: 'active', diedOn: null, family: { deletedAt: null } },
          select: {
            id: true,
            role: true,
            family: { select: { id: true, name: true, coverUrl: true } },
          },
        },
      },
    });
  }

  /**
   * `{ version }`: this person accepted that version of the terms and the
   * privacy policy - after sign-up, when the app shows a newer one.
   */
  @HttpCode(200)
  @Post('me/terms')
  async acceptTerms(@CurrentUser() user: AuthenticatedUser, @Body() dto: { version?: unknown }) {
    const accepted = termsAccepted(dto?.version);
    if (!('termsVersion' in accepted)) {
      throw new BadRequestException({ code: 'invalid_version', message: 'A version looks like 1.0.' });
    }
    return this.prisma.user.update({
      where: { id: user.id },
      data: accepted,
      select: { termsVersion: true, termsAcceptedAt: true },
    });
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    dto: {
      displayName?: string;
      avatarUrl?: string;
      locale?: string;
      shareUsageStats?: boolean;
      notifyEvents?: boolean;
      notifyComments?: boolean;
      notifyReminders?: boolean;
      defaultReminderMinutes?: number | null;
      /** Explicit consent for health information: true gives it now, false withdraws it. */
      healthConsent?: boolean;
    },
  ) {
    const reminder = dto.defaultReminderMinutes;
    if (reminder !== undefined && reminder !== null && !isReminderOffset(reminder)) {
      throw new BadRequestException({
        code: 'invalid_reminder',
        message: 'A default reminder is a whole number of minutes, up to a week before.',
      });
    }
    // "   " was saved as an account with no name (common/input.ts).
    const displayName =
      dto.displayName !== undefined
        ? requiredText(dto.displayName, LIMITS.personName, 'invalid_display_name', 'A name')
        : undefined;

    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(displayName ? { displayName } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.locale ? { locale: dto.locale } : {}),
        // Only a real boolean: "false" as a string would read as yes.
        ...(typeof dto.shareUsageStats === 'boolean' ? { shareUsageStats: dto.shareUsageStats } : {}),
        ...(typeof dto.notifyEvents === 'boolean' ? { notifyEvents: dto.notifyEvents } : {}),
        ...(typeof dto.notifyComments === 'boolean' ? { notifyComments: dto.notifyComments } : {}),
        ...(typeof dto.notifyReminders === 'boolean' ? { notifyReminders: dto.notifyReminders } : {}),
        ...(reminder !== undefined ? { defaultReminderMinutes: reminder } : {}),
        ...(typeof dto.healthConsent === 'boolean' ? { healthConsentAt: dto.healthConsent ? new Date() : null } : {}),
      },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        locale: true,
        shareUsageStats: true,
        ...PREFERENCES,
        healthConsentAt: true,
      },
    });
  }
}

function contextFrom(req: Request): AuthContext {
  const ip = req.ip ?? req.socket.remoteAddress ?? '';
  return {
    userAgent: req.headers['user-agent'],
    ipHash: ip
      ? createHash('sha256')
          .update(`${process.env.AUDIT_IP_SALT ?? ''}:${ip}`)
          .digest('hex')
          .slice(0, 32)
      : undefined,
  };
}
