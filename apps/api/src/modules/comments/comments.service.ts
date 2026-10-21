import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ReactionKind } from '@prisma/client';

import { LIMITS, requiredText } from '../../common/input';
import { PrismaService } from '../../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';

/**
 * A comment's words: empty is the old `403 empty_comment` the app knows;
 * not text, or longer than any message the app sends, a 400 (common/input.ts).
 */
function commentText(body: unknown): string {
  if (typeof body === 'string' && body.trim() === '') {
    throw new ForbiddenException({ code: 'empty_comment', message: 'Comment cannot be empty.' });
  }
  return requiredText(body, LIMITS.comment, 'invalid_comment', 'A comment');
}

/**
 * Comments and reactions.
 *
 * THE RULE RUNNING THROUGH THIS WHOLE FILE: every operation starts with
 * `assertCanOpenEvent`. Comments are part of an event — if the event is not
 * visible, then neither is the fact that somebody commented on it. And they
 * are part of what a closed time capsule keeps: seeing its envelope is not
 * reading what the family wrote on it.
 *
 * Without that check the comments endpoint would become a way around
 * visibility control: `GET /events/{id}/comments` would reveal both that the
 * event exists and what it is about, through other people's words.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(ctx: ViewerContext, eventId: string) {
    await this.visibility.assertCanOpenEvent(ctx, eventId);

    return this.prisma.comment.findMany({
      // Not what somebody this viewer blocked wrote (docs/02-DATA-MODEL.md, Blocks).
      where: {
        eventId,
        deletedAt: null,
        author: { blockedBy: { none: { blockerMemberId: ctx.memberId } } },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true, role: true } },
      },
    });
  }

  async create(ctx: ViewerContext, eventId: string, body: string) {
    await this.visibility.assertCanOpenEvent(ctx, eventId);
    this.visibility.assertCan(ctx, 'comment.create');

    const text = commentText(body);

    const comment = await this.prisma.comment.create({
      data: { eventId, authorMemberId: ctx.memberId, body: text },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true, role: true } },
      },
    });

    // The people already in this conversation hear about the reply. Not
    // awaited, and it never throws - see notifications.service.ts.
    void this.notifications.commentAdded(ctx.familyId, eventId, ctx.memberId);

    return comment;
  }

  async update(ctx: ViewerContext, commentId: string, body: string) {
    const comment = await this.requireComment(ctx, commentId);

    // Only its author edits a comment. Not even an administrator may — rewriting
    // someone else's words in a family chronicle is not a management action.
    if (comment.authorMemberId !== ctx.memberId) {
      throw new ForbiddenException({
        code: 'not_comment_author',
        message: 'Only the author can edit a comment.',
      });
    }

    // The same rules as a new one: an edit could empty a comment before.
    return this.prisma.comment.update({
      where: { id: commentId },
      data: { body: commentText(body) },
    });
  }

  /** The author deletes their own; an administrator may delete any (moderation). */
  async remove(ctx: ViewerContext, commentId: string) {
    const comment = await this.requireComment(ctx, commentId);

    const mayDelete =
      comment.authorMemberId === ctx.memberId || this.visibility.can(ctx, 'event.delete_any');

    if (!mayDelete) {
      throw new ForbiddenException({
        code: 'not_comment_author',
        message: 'Cannot delete this comment.',
      });
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * A reaction toggles: the same reaction again removes it, a different one replaces it.
   * One member, one reaction per event (a composite primary key).
   */
  async toggleReaction(ctx: ViewerContext, eventId: string, kind: ReactionKind) {
    await this.visibility.assertCanOpenEvent(ctx, eventId);
    this.visibility.assertCan(ctx, 'reaction.create');

    const existing = await this.prisma.reaction.findUnique({
      where: { eventId_memberId: { eventId, memberId: ctx.memberId } },
    });

    if (existing?.kind === kind) {
      await this.prisma.reaction.delete({
        where: { eventId_memberId: { eventId, memberId: ctx.memberId } },
      });
      return null;
    }

    return this.prisma.reaction.upsert({
      where: { eventId_memberId: { eventId, memberId: ctx.memberId } },
      create: { eventId, memberId: ctx.memberId, kind },
      update: { kind },
    });
  }

  // -------------------------------------------------------------------------

  private async requireComment(ctx: ViewerContext, commentId: string) {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, deletedAt: null },
      select: { id: true, eventId: true, authorMemberId: true },
    });

    if (!comment) {
      throw new NotFoundException({ code: 'comment_not_found', message: 'Comment not found.' });
    }

    // The event's visibility is checked on the edit and delete paths too — a
    // comment id alone gives no right to touch it.
    await this.visibility.assertCanOpenEvent(ctx, comment.eventId);
    return comment;
  }
}
