import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { RateLimit } from '../../common/rate-limit.guard';
import { CurrentUser, Public, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import type { ClientErrorInput } from './scrub';
import { TelemetryService, type IncomingEvent } from './telemetry.service';

/**
 * Where the app's analytics and error reports arrive. See docs/05-API.md.
 *
 * Both answer 204 whatever was kept: the app has nothing to do differently
 * when an event is dropped, and saying which ones were would only teach a
 * sender what gets through.
 */
@Controller('v1/telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  /** A batch of product events, signed in - the family is checked, the person is not stored. */
  @HttpCode(204)
  @RateLimit({ ip: { limit: 120, windowSec: 300 } })
  @Post('events')
  async events(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: { familyId?: string; events?: IncomingEvent[] },
  ): Promise<void> {
    await this.telemetry.record(user.id, dto?.familyId, dto?.events);
  }

  /**
   * One error. Public, because the app can break before anybody has signed in
   * - and the report carries nobody in it, so a session would add nothing but
   * a way to tell whose it was. Counted per address instead.
   */
  @Public()
  @HttpCode(204)
  @RateLimit({ ip: { limit: 20, windowSec: 300 } })
  @Post('errors')
  async errors(@Body() dto: ClientErrorInput): Promise<void> {
    await this.telemetry.recordError(dto ?? {});
  }
}
