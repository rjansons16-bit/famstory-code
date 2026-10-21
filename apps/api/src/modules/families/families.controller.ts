import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import type { MemberRole } from '@prisma/client';
import type { Request } from 'express';

import { originOf } from '../../common/origin';
import { StorageService } from '../../common/storage/storage.service';
import { CurrentUser, Public, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { VisibilityService } from '../visibility/visibility.service';
import { FamiliesService } from './families.service';

@Controller('v1')
export class FamiliesController {
  constructor(
    private readonly families: FamiliesService,
    private readonly visibility: VisibilityService,
    private readonly storage: StorageService,
  ) {}

  /** Stored photographs leave as short-lived signed links (avatars.service.ts). */
  private faces<T extends object>(value: T, req: Request): T {
    return this.storage.withAvatarUrls(value, originOf(req));
  }

  // --- The family ---

  @Post('families')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: { name: string; locale?: string; birthDate?: string; interests?: string[] },
    @Req() req: Request,
  ) {
    return this.faces(await this.families.create(user.id, dto), req);
  }

  @Get('families/:familyId')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Req() req: Request,
  ) {
    return this.faces(await this.families.findOne(await this.ctx(user, familyId)), req);
  }

  @Patch('families/:familyId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Body() dto: { name?: string; coverUrl?: string; locale?: string },
  ) {
    return this.families.update(await this.ctx(user, familyId), dto);
  }

  // --- Members ---

  @Post('families/:familyId/children')
  async createChild(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Body() dto: { displayName: string; birthDate?: string; managedByMemberId?: string },
    @Req() req: Request,
  ) {
    return this.faces(await this.families.createChild(await this.ctx(user, familyId), dto), req);
  }

  /**
   * Your own name and birthday in this family.
   *
   * `/me` under the family rather than `/members/me`: the role endpoint below
   * takes `:memberId`, and a route that only works because it is declared
   * first is a route that breaks when somebody reorders the file.
   */
  @Patch('families/:familyId/me')
  async updateOwnProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Body() dto: { displayName?: string; birthDate?: string | null; interests?: string[] },
    @Req() req: Request,
  ) {
    return this.faces(await this.families.updateOwnProfile(await this.ctx(user, familyId), dto), req);
  }

  /** What a child likes, set by the adults who manage the profile. See the service. */
  @Patch('families/:familyId/members/:memberId/interests')
  async updateChildInterests(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
    @Body() dto: { interests?: string[] },
    @Req() req: Request,
  ) {
    return this.faces(
      await this.families.updateChildInterests(await this.ctx(user, familyId), memberId, dto?.interests),
      req,
    );
  }

  /** A visit begins; answers with when the previous one did. See the service. */
  @HttpCode(200)
  @Post('families/:familyId/me/seen')
  async markSeen(@CurrentUser() user: AuthenticatedUser, @Param('familyId') familyId: string) {
    return this.families.markSeen(await this.ctx(user, familyId));
  }

  @Patch('families/:familyId/members/:memberId')
  async updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
    @Body() dto: { role: MemberRole },
    @Req() req: Request,
  ) {
    return this.faces(
      await this.families.updateRole(await this.ctx(user, familyId), memberId, dto.role),
      req,
    );
  }

  /** In memoriam: `{ diedOn: "<date>" }` marks, `{ diedOn: null }` takes it back. Admins only. */
  @Patch('families/:familyId/members/:memberId/memorial')
  async setDiedOn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
    @Body() dto: { diedOn: string | null },
    @Req() req: Request,
  ) {
    return this.faces(
      await this.families.setDiedOn(await this.ctx(user, familyId), memberId, dto?.diedOn ?? null),
      req,
    );
  }

  @Delete('families/:familyId/members/:memberId')
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.families.remove(await this.ctx(user, familyId), memberId);
  }

  // --- Grupas ---

  @Post('families/:familyId/groups')
  async createGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Body() dto: { name: string; memberIds?: string[] },
  ) {
    return this.families.createGroup(await this.ctx(user, familyId), dto);
  }

  @Patch('families/:familyId/groups/:groupId')
  async updateGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('groupId') groupId: string,
    @Body() dto: { name?: string; memberIds?: string[] },
  ) {
    return this.families.updateGroup(await this.ctx(user, familyId), groupId, dto);
  }

  @HttpCode(204)
  @Delete('families/:familyId/groups/:groupId')
  async deleteGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('groupId') groupId: string,
  ): Promise<void> {
    await this.families.deleteGroup(await this.ctx(user, familyId), groupId);
  }

  // --- Invitations ---

  @Get('families/:familyId/invitations')
  async listInvitations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
  ) {
    return this.families.listInvitations(await this.ctx(user, familyId));
  }

  @Post('families/:familyId/invitations')
  async invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Body() dto: { email?: string; role: MemberRole; groupIds?: string[] },
  ) {
    return this.families.invite(await this.ctx(user, familyId), dto);
  }

  @Delete('families/:familyId/invitations/:invitationId')
  async revokeInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.families.revokeInvitation(await this.ctx(user, familyId), invitationId);
  }

  /** Public: the person is not in the family yet and may not even be registered. */
  @Public()
  @Get('invitations/:code')
  preview(@Param('code') code: string) {
    return this.families.previewInvitation(code);
  }

  @HttpCode(200)
  @Post('invitations/:code/accept')
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    // Optional, and older clients send no body at all.
    @Body() dto?: { birthDate?: string; interests?: string[] },
  ) {
    return this.families.acceptInvitation(user.id, code, {
      birthDate: dto?.birthDate,
      interests: dto?.interests,
    });
  }

  private ctx(user: AuthenticatedUser, familyId: string) {
    return this.visibility.contextFor(user.id, familyId);
  }
}
