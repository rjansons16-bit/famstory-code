import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';

import { RateLimit } from '../../common/rate-limit.guard';
import { CurrentUser, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { PushService } from './push.service';

/**
 * A phone, for pushes (push.service.ts). The app registers after its person
 * said yes, again at each launch (tokens change), and removes it on signing
 * out.
 */
@Controller('v1/users/me/devices')
export class DevicesController {
  constructor(private readonly push: PushService) {}

  @RateLimit({ ip: { limit: 30, windowSec: 300 } })
  @HttpCode(204)
  @Post()
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: { platform?: unknown; token?: unknown; locale?: unknown },
  ): Promise<void> {
    await this.push.register(user.id, dto ?? {});
  }

  @HttpCode(204)
  @Delete(':token')
  async unregister(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string): Promise<void> {
    await this.push.unregister(user.id, token);
  }
}
