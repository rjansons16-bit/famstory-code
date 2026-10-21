import { ForbiddenException, Injectable } from '@nestjs/common';
import { MemberRole, MemberStatus, Prisma, VisibilityKind } from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';

/**
 * THE VISIBILITY LAYER — the most important file in the system.
 *
 * Every path that reads events goes through here: timeline, calendar, search,
 * event detail, notifications, export, AI input.
 *
 * Two rules that must not be broken:
 *
 *   1. FILTER IN THE DATABASE, NOT IN THE RESPONSE.
 *      Hidden events must never be loaded and then dropped. If they reach a
 *      pagination count or a cache, they leak the fact that they exist even
 *      when their content is never shown.
 *
 *   2. FAIL CLOSED.
 *      An unknown state means "do not show". Never the other way round.
 *
 * The client carries the same logic (apps/mobile/src/domain/visibility.ts), but
 * only for UX. A client-side check is not a security boundary.
 *
 * Specification: docs/02-DATA-MODEL.md
 */
@Injectable()
export class VisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Context
  // -------------------------------------------------------------------------

  /**
   * Finds the caller's member record in the family, plus their groups.
   * Throws ForbiddenException if the user is not in the family or was removed.
   */
  async contextFor(userId: string, familyId: string): Promise<ViewerContext> {
    const member = await this.prisma.member.findFirst({
      // Not a member the family has marked as having died: an account that
      // outlives its person is exactly the one somebody else might sign in to.
      where: { userId, familyId, status: MemberStatus.active, diedOn: null },
      select: {
        id: true,
        role: true,
        groupLinks: { select: { groupId: true } },
      },
    });

    if (!member) {
      // "No such family" and "no access" are deliberately indistinguishable —
      // one answer for both.
      throw new ForbiddenException({
        code: 'family_access_denied',
        message: 'No access to this family.',
      });
    }

    return {
      memberId: member.id,
      familyId,
      role: member.role,
      groupIds: member.groupLinks.map((g) => g.groupId),
    };
  }

  // -------------------------------------------------------------------------
  // The WHERE clause
  // -------------------------------------------------------------------------

  /**
   * A Prisma `where` fragment that returns ONLY visible events.
   *
   * Usage:
   *   this.prisma.event.findMany({
   *     where: { AND: [ { familyId }, visibility.eventFilter(ctx) ] },
   *   })
   */
  eventFilter(ctx: ViewerContext, now: Date = new Date()): Prisma.EventWhereInput {
    return {
      familyId: ctx.familyId,
      deletedAt: null,
      // A SURPRISE is kept from the one it is for until its day - before every
      // rule below, the author's included. Written as what may be seen rather
      // than as a NOT: SQL's NOT over a NULL column is NULL, and a NOT here
      // would have hidden every ordinary event. Fail closed: a surprise with
      // no reveal time matches none of the three and stays hidden from them.
      AND: [
        {
          OR: [
            { hiddenFromMemberId: null },
            { hiddenFromMemberId: { not: ctx.memberId } },
            { revealAt: { lte: now } },
          ],
        },
        // A BLOCK: what somebody this viewer blocked wrote is not shown to
        // them, wherever it would be (docs/02-DATA-MODEL.md, Blocks). Here,
        // so that no path that reads events can miss it. Positive too: "no
        // block from this viewer on the author" is NOT EXISTS, which is true
        // or false and never null. Nobody can block themselves, so the author
        // branch below is not affected.
        { author: { blockedBy: { none: { blockerMemberId: ctx.memberId } } } },
      ],
      OR: [
        // 1. The author always sees their own event — a private one included.
        { authorMemberId: ctx.memberId },

        // 2. Shared with the whole family.
        { visibilityKind: VisibilityKind.family },

        // 3. Shared with groups the viewer belongs to.
        //    An empty groupIds array produces `in: []`, which returns zero rows
        //    in Prisma — and that is correct: no groups, no group visibility.
        //
        //    `custom` is listed alongside `groups` and `members` because it can
        //    carry both lists at once: a viewer matches if they are in a named
        //    group OR named individually. `groups` and `members` are the same
        //    thing with one of the two lists empty.
        {
          visibilityKind: { in: [VisibilityKind.custom, VisibilityKind.groups] },
          visibility: { some: { groupId: { in: ctx.groupIds } } },
        },

        // 4. Shared with named members.
        {
          visibilityKind: { in: [VisibilityKind.custom, VisibilityKind.members] },
          visibility: { some: { memberId: ctx.memberId } },
        },

        // `private` is deliberately absent — branch 1 already covers it.
        // A new VisibilityKind with no branch added here stays INVISIBLE.
      ],
    };
  }

  /** Checks a single event. Throws ForbiddenException when it is not visible. */
  async assertCanSeeEvent(ctx: ViewerContext, eventId: string): Promise<void> {
    const found = await this.prisma.event.findFirst({
      where: { AND: [{ id: eventId }, this.eventFilter(ctx)] },
      select: { id: true },
    });

    if (!found) {
      // 403, not 404 — but with an identical body in both cases, so the
      // response never reveals whether the event exists at all.
      throw new ForbiddenException({
        code: 'visibility_denied',
        message: 'Event not available.',
      });
    }
  }

  /**
   * Is this a time capsule still closed to this viewer? The author sees
   * inside from the start; everybody else from `sealedUntil` on.
   */
  isSealedFor(
    ctx: ViewerContext,
    event: { sealedUntil?: Date | null; authorMemberId: string },
    now: Date = new Date(),
  ): boolean {
    if (!event.sealedUntil) return false;
    return event.sealedUntil.getTime() > now.getTime() && event.authorMemberId !== ctx.memberId;
  }

  /**
   * May this viewer see what is IN the event - its words, photographs, voice,
   * comments and reactions? Seeing it is not enough for a time capsule: the
   * envelope is visible, the contents are not. Every path that hands out
   * contents (comments, reactions, attachment links, uploads, guest links)
   * asks this rather than `assertCanSeeEvent`.
   */
  async assertCanOpenEvent(ctx: ViewerContext, eventId: string): Promise<void> {
    await this.assertCanSeeEvent(ctx, eventId);

    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { sealedUntil: true, authorMemberId: true },
    });
    if (this.isSealedFor(ctx, event)) {
      throw new ForbiddenException({
        code: 'capsule_sealed',
        message: 'This time capsule is not open yet.',
        opensAt: event.sealedUntil?.toISOString(),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Role capabilities
  // -------------------------------------------------------------------------

  private static readonly CAPABILITIES: Record<MemberRole, Capability[]> = {
    [MemberRole.admin]: [
      'family.edit',
      'family.delete',
      'member.invite',
      'member.edit_role',
      'member.remove',
      'group.manage',
      'event.create',
      'event.edit_own',
      'event.edit_any',
      'event.delete_any',
      'comment.create',
      'reaction.create',
      'subscription.manage',
      'export.run',
    ],
    [MemberRole.member]: ['event.create', 'event.edit_own', 'comment.create', 'reaction.create'],
    [MemberRole.child]: ['reaction.create'],
    [MemberRole.viewer]: ['comment.create', 'reaction.create'],
  };

  can(ctx: ViewerContext, capability: Capability): boolean {
    return VisibilityService.CAPABILITIES[ctx.role].includes(capability);
  }

  assertCan(ctx: ViewerContext, capability: Capability): void {
    if (!this.can(ctx, capability)) {
      throw new ForbiddenException({
        code: 'insufficient_role',
        message: `Role ${ctx.role} cannot perform ${capability}.`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Protecting children's data
  // -------------------------------------------------------------------------

  /**
   * The safe default for a new event.
   *
   * When a child is among the participants, visibility narrows to the Parents
   * group. The client already does this in the UI, but the server must not rely
   * on the client: an API call can come from anywhere.
   *
   * The study's regulatory risk: "regulatory risk around children's data".
   */
  async defaultVisibilityFor(
    familyId: string,
    participantMemberIds: string[],
  ): Promise<{ kind: VisibilityKind; groupIds?: string[] }> {
    if (participantMemberIds.length === 0) {
      return { kind: VisibilityKind.family };
    }

    const childCount = await this.prisma.member.count({
      where: { familyId, id: { in: participantMemberIds }, role: MemberRole.child },
    });

    if (childCount === 0) return { kind: VisibilityKind.family };

    const parents = await this.prisma.group.findFirst({
      where: { familyId, isSystem: true, icon: 'parents' },
      select: { id: true },
    });

    // No Parents group means a family in a state nobody planned for - every
    // family is created with one. Fail closed: the author alone, rather than a
    // child's event quietly going to the whole family.
    return parents
      ? { kind: VisibilityKind.groups, groupIds: [parents.id] }
      : { kind: VisibilityKind.private };
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ViewerContext {
  memberId: string;
  familyId: string;
  role: MemberRole;
  groupIds: string[];
}

export type Capability =
  | 'family.edit'
  | 'family.delete'
  | 'member.invite'
  | 'member.edit_role'
  | 'member.remove'
  | 'group.manage'
  | 'event.create'
  | 'event.edit_own'
  | 'event.edit_any'
  | 'event.delete_any'
  | 'comment.create'
  | 'reaction.create'
  | 'subscription.manage'
  | 'export.run';
