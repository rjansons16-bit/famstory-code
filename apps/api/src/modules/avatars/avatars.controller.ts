import { Controller, Delete, HttpCode, Param, Put, Req } from '@nestjs/common';
import type { Request } from 'express';

import { originOf } from '../../common/origin';
import { StorageService } from '../../common/storage/storage.service';
import { CurrentUser, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { VisibilityService } from '../visibility/visibility.service';
import { AvatarsService } from './avatars.service';

/**
 * A member's photograph. The image is the request body, as it is: no JSON,
 * no form - the raw stream, which no body parser touches for image types.
 */
@Controller('v1/families/:familyId/members/:memberId/avatar')
export class AvatarsController {
  constructor(
    private readonly avatars: AvatarsService,
    private readonly visibility: VisibilityService,
    private readonly storage: StorageService,
  ) {}

  @Put()
  async set(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
    @Req() req: Request,
  ): Promise<{ avatarUrl: string }> {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    const { avatarKey } = await this.avatars.set(ctx, memberId, req.headers['content-type'], req);
    return { avatarUrl: this.storage.signedUrl(avatarKey, originOf(req)).url };
  }

  @HttpCode(204)
  @Delete()
  async clear(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
  ): Promise<void> {
    await this.avatars.clear(await this.visibility.contextFor(user.id, familyId), memberId);
  }
}
