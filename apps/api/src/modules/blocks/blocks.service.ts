import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { MemberRole, MemberStatus } from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';
import type { ViewerContext } from '../visibility/visibility.service';

/**
 * BLOCKS: "I do not want to see what this person posts."
 *
 * App Review guideline 1.2 asks an app whose people post things for a way to
 * block an abusive user (docs/09-APP-STORES.md §3.3). An admin can remove a
 * member; a block is what anybody can do for themselves, about anybody,
 * admins included.
 *
 * This file only keeps the list. What a block hides is decided where things
 * are read: `VisibilityService.eventFilter` for entries, the comment and
 * reaction queries, and the bell (docs/02-DATA-MODEL.md, Blocks).
 *
 * The rules:
 *
 *   - Not yourself, and not a child profile: a child has no account and
 *     writes nothing.
 *   - Only an active member of your own family. Anybody else gets the answer
 *     a member who is not there gets.
 *   - Once. Blocking twice, or unblocking somebody who is not blocked,
 *     changes nothing.
 *   - Nobody is told, the admins included.
 */
@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async block(ctx: ViewerContext, memberId: unknown): Promise<{ memberId: string }> {
    const id = readId(memberId);
    if (id === ctx.memberId) {
      throw new BadRequestException({ code: 'block_self', message: 'You cannot block yourself.' });
    }

    const target = await this.prisma.member.findFirst({
      where: { id, familyId: ctx.familyId, status: MemberStatus.active },
      select: { role: true },
    });
    if (!target) throw notHere();
    if (target.role === MemberRole.child) {
      throw new BadRequestException({
        code: 'block_child',
        message: 'A child profile writes nothing, so there is nothing to block.',
      });
    }

    await this.prisma.memberBlock.upsert({
      where: { blockerMemberId_blockedMemberId: { blockerMemberId: ctx.memberId, blockedMemberId: id } },
      create: { blockerMemberId: ctx.memberId, blockedMemberId: id, familyId: ctx.familyId },
      update: {},
    });
    return { memberId: id };
  }

  /** Scoped to the caller: one person cannot lift another's block. */
  async unblock(ctx: ViewerContext, memberId: string): Promise<void> {
    await this.prisma.memberBlock.deleteMany({
      where: { blockerMemberId: ctx.memberId, blockedMemberId: memberId },
    });
  }
}

function readId(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 64) {
    throw new BadRequestException({ code: 'invalid_block', message: 'Which member is missing.' });
  }
  return value.trim();
}

/** The answer for somebody outside the family, removed, or not there at all - the same one. */
function notHere(): ForbiddenException {
  return new ForbiddenException({ code: 'member_not_found', message: 'No such member in this family.' });
}
