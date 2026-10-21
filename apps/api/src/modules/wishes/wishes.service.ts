import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberRole, MemberStatus } from '@prisma/client';

import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import type { ViewerContext } from '../visibility/visibility.service';

const MAX_TEXT = 200;
/** A list, not a catalogue: past this it is a shopping app. */
const MAX_ITEMS_PER_PERSON = 100;

export interface WishView {
  id: string;
  text: string;
  addedByMemberId: string;
  /** Null for the person the list is for, always - see the service. */
  claimedByMemberId: string | null;
  createdAt: string;
}

/**
 * WISH LISTS - what to give somebody, without them finding out.
 *
 * One rule makes this a feature and not a notes field, and it is enforced
 * here rather than trusted to the app: the person a list is FOR sees only the
 * lines they wrote themselves, and never who is getting what. So they can
 * write "a warm scarf" and the rest of the family can write "the blue one,
 * from the market in Cēsis" underneath, and Martin can mark it as his without
 * spoiling December for anybody.
 *
 * Everybody else in the family - grandparents included, who are the ones
 * buying - sees the whole list and the claims. A child's list is managed by
 * the adults around them like the rest of a child profile, and reading it is
 * written to the audit log like the rest of a child's data.
 */
@Injectable()
export class WishesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: ViewerContext, forMemberId: string): Promise<WishView[]> {
    const owner = await this.requireOwner(ctx.familyId, forMemberId);
    const isOwner = forMemberId === ctx.memberId;

    const rows = await this.prisma.wishItem.findMany({
      where: {
        familyId: ctx.familyId,
        forMemberId,
        deletedAt: null,
        // The owner's view, in the query rather than after it: the others'
        // ideas are never loaded for them at all.
        ...(isOwner ? { addedByMemberId: ctx.memberId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    if (owner.role === MemberRole.child) {
      await this.audit.record({
        familyId: ctx.familyId,
        action: 'child_profile.viewed',
        entityType: 'WishList',
        entityId: forMemberId,
        metadata: { viewerRole: ctx.role },
      });
    }

    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      addedByMemberId: row.addedByMemberId,
      claimedByMemberId: isOwner ? null : row.claimedByMemberId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * A line on somebody's list. `claim` makes it yours at once - a gift idea
   * taken from the app's suggestions is one somebody has decided to buy, and
   * two steps would leave a moment where a second person could take it too.
   * Never on your own list, for the same reason as `toggleClaim`.
   */
  async add(ctx: ViewerContext, forMemberId: string, text: unknown, claim = false): Promise<WishView> {
    this.assertMayWrite(ctx);
    await this.requireOwner(ctx.familyId, forMemberId);
    const claimedBy = claim && forMemberId !== ctx.memberId ? ctx.memberId : null;

    const clean = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
    if (clean.length < 2 || clean.length > MAX_TEXT) {
      throw new BadRequestException({
        code: 'invalid_wish',
        message: `A wish is between 2 and ${MAX_TEXT} characters.`,
      });
    }

    const count = await this.prisma.wishItem.count({
      where: { familyId: ctx.familyId, forMemberId, deletedAt: null },
    });
    if (count >= MAX_ITEMS_PER_PERSON) {
      throw new BadRequestException({ code: 'wish_list_full', message: 'This list is full.' });
    }

    const row = await this.prisma.wishItem.create({
      data: {
        familyId: ctx.familyId,
        forMemberId,
        text: clean,
        addedByMemberId: ctx.memberId,
        claimedByMemberId: claimedBy,
      },
    });
    return {
      id: row.id,
      text: row.text,
      addedByMemberId: row.addedByMemberId,
      claimedByMemberId: claimedBy,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Whoever wrote a line, or an admin, takes it off. */
  async remove(ctx: ViewerContext, wishId: string): Promise<void> {
    const row = await this.requireVisible(ctx, wishId);
    if (row.addedByMemberId !== ctx.memberId && ctx.role !== MemberRole.admin) {
      throw new ForbiddenException({ code: 'insufficient_role', message: 'Only whoever added it.' });
    }
    await this.prisma.wishItem.update({ where: { id: wishId }, data: { deletedAt: new Date() } });
  }

  /**
   * "I'll get this", and taking it back. Nobody claims from their own list -
   * they cannot see the claims, and a claim they made would be a claim they
   * could see.
   */
  async toggleClaim(ctx: ViewerContext, wishId: string): Promise<WishView> {
    this.assertMayWrite(ctx);
    const row = await this.requireVisible(ctx, wishId);
    if (row.forMemberId === ctx.memberId) {
      throw new ForbiddenException({ code: 'own_wish', message: 'Not on your own list.' });
    }

    let claimedBy: string | null;
    if (row.claimedByMemberId === ctx.memberId) {
      claimedBy = null;
    } else if (row.claimedByMemberId) {
      throw new ConflictException({ code: 'already_claimed', message: 'Somebody is already getting this.' });
    } else {
      claimedBy = ctx.memberId;
    }

    // Claimed only if still unclaimed (or still mine to release): two people
    // pressing at once cannot both end up holding it.
    const updated = await this.prisma.wishItem.updateMany({
      where: { id: wishId, claimedByMemberId: row.claimedByMemberId },
      data: { claimedByMemberId: claimedBy },
    });
    if (updated.count === 0) {
      throw new ConflictException({ code: 'already_claimed', message: 'Somebody is already getting this.' });
    }

    return {
      id: row.id,
      text: row.text,
      addedByMemberId: row.addedByMemberId,
      claimedByMemberId: claimedBy,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // -------------------------------------------------------------------------

  /** Children have no account and act through their parents; everybody else may write. */
  private assertMayWrite(ctx: ViewerContext): void {
    if (ctx.role === MemberRole.child) {
      throw new ForbiddenException({ code: 'insufficient_role', message: 'Not for a child profile.' });
    }
  }

  /** A present member of this family - not somebody who left, and not somebody who died. */
  private async requireOwner(familyId: string, memberId: string) {
    const owner = await this.prisma.member.findFirst({
      where: { id: memberId, familyId, status: { not: MemberStatus.removed }, diedOn: null },
      select: { id: true, role: true },
    });
    if (!owner) {
      throw new NotFoundException({ code: 'member_not_found', message: 'Member not found.' });
    }
    return owner;
  }

  /**
   * A line this viewer is allowed to know exists. For the owner that is only
   * their own lines; the others' ideas are "not found", indistinguishable from
   * a line that never was.
   */
  private async requireVisible(ctx: ViewerContext, wishId: string) {
    const row = await this.prisma.wishItem.findFirst({
      where: { id: wishId, familyId: ctx.familyId, deletedAt: null },
    });
    const hiddenFromOwner = row && row.forMemberId === ctx.memberId && row.addedByMemberId !== ctx.memberId;
    if (!row || hiddenFromOwner) {
      throw new NotFoundException({ code: 'not_found', message: 'Not found.' });
    }
    return row;
  }
}
