import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { VisibilityService } from '../visibility/visibility.service';
import { WishesService } from './wishes.service';

/** Wish lists. The rule about who sees what lives in the service. */
@Controller('v1/families/:familyId')
export class WishesController {
  constructor(
    private readonly wishes: WishesService,
    private readonly visibility: VisibilityService,
  ) {}

  @Get('members/:memberId/wishes')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.wishes.list(await this.visibility.contextFor(user.id, familyId), memberId);
  }

  @Post('members/:memberId/wishes')
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
    @Body() dto: { text: string; claim?: boolean },
  ) {
    return this.wishes.add(
      await this.visibility.contextFor(user.id, familyId),
      memberId,
      dto?.text,
      dto?.claim === true,
    );
  }

  @HttpCode(204)
  @Delete('wishes/:wishId')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('wishId') wishId: string,
  ): Promise<void> {
    await this.wishes.remove(await this.visibility.contextFor(user.id, familyId), wishId);
  }

  @HttpCode(200)
  @Post('wishes/:wishId/claim')
  async claim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('wishId') wishId: string,
  ) {
    return this.wishes.toggleClaim(await this.visibility.contextFor(user.id, familyId), wishId);
  }
}
