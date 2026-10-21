import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { VisibilityService } from '../visibility/visibility.service';
import { AiService } from './ai.service';

/**
 * AI endpoints. See docs/05-API.md.
 *
 * Every call goes through `contextFor()` — suggestions are family data too, and
 * conflict detection reveals when a member has something on. None of that may
 * be reachable from outside the family.
 */
@Controller('v1/families/:familyId/ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly visibility: VisibilityService,
  ) {}

  @HttpCode(200)
  @Post('suggest-category')
  async suggestCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Body() dto: { title: string; description?: string },
  ) {
    await this.visibility.contextFor(user.id, familyId);
    return this.ai.suggestCategory(familyId, dto.title, dto.description);
  }

  @HttpCode(200)
  @Post('detect-conflicts')
  async detectConflicts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Body()
    dto: { startsAt: string; endsAt?: string; participantMemberIds: string[]; excludeEventId?: string },
  ) {
    // The context goes to the service, not only the check: what counts as a
    // conflict is what this person can see.
    const ctx = await this.visibility.contextFor(user.id, familyId);
    return this.ai.detectConflicts(ctx, {
      startsAt: new Date(dto.startsAt),
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      participantMemberIds: Array.isArray(dto.participantMemberIds) ? dto.participantMemberIds : [],
      excludeEventId: dto.excludeEventId,
    });
  }

  @HttpCode(200)
  @Post('suggest-reminder')
  async suggestReminder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Body() dto: { categoryId: string },
  ) {
    await this.visibility.contextFor(user.id, familyId);
    return this.ai.suggestReminderTime(familyId, dto.categoryId);
  }

  /**
   * Response tracking. Without it there is no data on which to decide whether
   * the AI layer is worth monetising as a separate add-on at all.
   */
  @HttpCode(204)
  @Post('suggestions/:id/accept')
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.visibility.contextFor(user.id, familyId);
    await this.ai.accept(id);
  }

  @HttpCode(204)
  @Post('suggestions/:id/reject')
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.visibility.contextFor(user.id, familyId);
    await this.ai.reject(id);
  }
}
