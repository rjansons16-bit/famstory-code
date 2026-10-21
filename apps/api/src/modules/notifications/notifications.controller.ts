import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { VisibilityService } from '../visibility/visibility.service';
import { NotificationsService } from './notifications.service';

/**
 * The bell, per family. See docs/05-API.md.
 *
 * Every route acts on whoever holds the token: there is no member id in any of
 * them, so there is no version of these that reads or clears somebody else's.
 */
@Controller('v1/families/:familyId/notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly visibility: VisibilityService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Param('familyId') familyId: string) {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    return this.notifications.listFor(ctx);
  }

  @Post('read-all')
  @HttpCode(204)
  async readAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
  ): Promise<void> {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    await this.notifications.markAllRead(ctx);
  }

  @Post(':notificationId/read')
  @HttpCode(204)
  async read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('notificationId') notificationId: string,
  ): Promise<void> {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    await this.notifications.markRead(ctx, notificationId);
  }
}
