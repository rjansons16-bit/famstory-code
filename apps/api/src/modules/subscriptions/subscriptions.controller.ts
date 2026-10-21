import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';

import { RateLimit } from '../../common/rate-limit.guard';
import { CurrentUser, Public, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { VisibilityService } from '../visibility/visibility.service';
import { SubscriptionsService } from './subscriptions.service';

/** docs/05-API.md, Subscription. The plan itself also comes with the family. */
@Controller('v1')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly visibility: VisibilityService,
  ) {}

  /** After a purchase or a restore in the app: read the family's plan from RevenueCat now. */
  @RateLimit({ ip: { limit: 30, windowSec: 300 } })
  @HttpCode(200)
  @Post('families/:familyId/subscription/sync')
  async sync(@CurrentUser() user: AuthenticatedUser, @Param('familyId') familyId: string) {
    // Any member: the answer is the family's plan, which every member sees anyway.
    const ctx = await this.visibility.contextFor(user.id, familyId);
    return this.subscriptions.sync(ctx.familyId);
  }

  /** RevenueCat's webhook (docs/12-LAUNCH-RUNBOOK.md): `Authorization` is the shared value. */
  @Public()
  @RateLimit({ ip: { limit: 120, windowSec: 60 } })
  @HttpCode(200)
  @Post('webhooks/revenuecat')
  webhook(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    return this.subscriptions.webhook(authorization, body);
  }
}
