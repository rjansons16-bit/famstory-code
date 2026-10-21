import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { VisibilityService } from '../visibility/visibility.service';
import { BlocksService } from './blocks.service';

/** docs/05-API.md, Blocks. The list itself comes with the family (`blockedMemberIds`). */
@Controller('v1/families/:familyId')
export class BlocksController {
  constructor(
    private readonly blocks: BlocksService,
    private readonly visibility: VisibilityService,
  ) {}

  /** `{ memberId }` */
  @HttpCode(201)
  @Post('blocks')
  async block(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Body() dto: { memberId?: unknown },
  ) {
    return this.blocks.block(await this.visibility.contextFor(user.id, familyId), dto?.memberId);
  }

  @HttpCode(204)
  @Delete('blocks/:memberId')
  async unblock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
  ) {
    await this.blocks.unblock(await this.visibility.contextFor(user.id, familyId), memberId);
  }
}
