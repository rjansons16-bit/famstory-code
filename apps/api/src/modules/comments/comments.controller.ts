import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import type { ReactionKind } from '@prisma/client';

import { CurrentUser, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { VisibilityService } from '../visibility/visibility.service';
import { CommentsService } from './comments.service';

@Controller('v1/families/:familyId')
export class CommentsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly visibility: VisibilityService,
  ) {}

  @Get('events/:eventId/comments')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.comments.list(await this.ctx(user, familyId), eventId);
  }

  @Post('events/:eventId/comments')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('eventId') eventId: string,
    @Body() dto: { body: string },
  ) {
    return this.comments.create(await this.ctx(user, familyId), eventId, dto.body);
  }

  @Patch('comments/:commentId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('commentId') commentId: string,
    @Body() dto: { body: string },
  ) {
    return this.comments.update(await this.ctx(user, familyId), commentId, dto.body);
  }

  @HttpCode(204)
  @Delete('comments/:commentId')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('commentId') commentId: string,
  ): Promise<void> {
    await this.comments.remove(await this.ctx(user, familyId), commentId);
  }

  /** PUT, not POST: a reaction is idempotent — one member, one reaction. */
  @Put('events/:eventId/reactions')
  async react(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('eventId') eventId: string,
    @Body() dto: { kind: ReactionKind },
  ) {
    return this.comments.toggleReaction(await this.ctx(user, familyId), eventId, dto.kind);
  }

  private ctx(user: AuthenticatedUser, familyId: string) {
    return this.visibility.contextFor(user.id, familyId);
  }
}
