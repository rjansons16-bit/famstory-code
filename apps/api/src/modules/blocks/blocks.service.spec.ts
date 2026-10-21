import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MemberRole, MemberStatus } from '@prisma/client';

import type { PrismaService } from '../../common/prisma.service';
import type { ViewerContext } from '../visibility/visibility.service';
import { BlocksService } from './blocks.service';

/**
 * Blocks: the list, and who may be on it. What a block hides is tested where
 * it is decided - visibility.service.spec.ts, notifications.service.spec.ts.
 */

const ME: ViewerContext = { memberId: 'mem_me', familyId: 'fam_1', role: MemberRole.member, groupIds: [] };

function harness(target: { role: MemberRole } | null = { role: MemberRole.member }) {
  const prisma = {
    member: { findFirst: jest.fn().mockResolvedValue(target) },
    memberBlock: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { service: new BlocksService(prisma as unknown as PrismaService), prisma };
}

describe('BlocksService.block', () => {
  it('blocks a member of your own family, once however often it is asked', async () => {
    const h = harness();

    await expect(h.service.block(ME, 'mem_martin')).resolves.toEqual({ memberId: 'mem_martin' });

    expect(h.prisma.member.findFirst.mock.calls[0][0].where).toEqual({
      id: 'mem_martin',
      familyId: 'fam_1',
      status: MemberStatus.active,
    });
    // An upsert with nothing to update: the second block is the first one.
    expect(h.prisma.memberBlock.upsert).toHaveBeenCalledWith({
      where: { blockerMemberId_blockedMemberId: { blockerMemberId: 'mem_me', blockedMemberId: 'mem_martin' } },
      create: { blockerMemberId: 'mem_me', blockedMemberId: 'mem_martin', familyId: 'fam_1' },
      update: {},
    });
  });

  it('an admin can be blocked: a block is for the one who makes it, whoever the other is', async () => {
    const h = harness({ role: MemberRole.admin });
    await expect(h.service.block(ME, 'mem_admin')).resolves.toEqual({ memberId: 'mem_admin' });
  });

  it('not yourself', async () => {
    const h = harness();
    await expect(h.service.block(ME, 'mem_me')).rejects.toBeInstanceOf(BadRequestException);
    expect(h.prisma.memberBlock.upsert).not.toHaveBeenCalled();
  });

  it('not a child profile, which writes nothing', async () => {
    const h = harness({ role: MemberRole.child });
    await expect(h.service.block(ME, 'mem_emily')).rejects.toMatchObject({
      response: { code: 'block_child' },
    });
    expect(h.prisma.memberBlock.upsert).not.toHaveBeenCalled();
  });

  it('somebody outside the family, removed or made up gets one answer', async () => {
    const h = harness(null);
    await expect(h.service.block(ME, 'mem_elsewhere')).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.prisma.memberBlock.upsert).not.toHaveBeenCalled();
  });

  it('refuses a request without a member, rather than guessing', async () => {
    const h = harness();
    for (const bad of [undefined, null, '', '   ', 42, 'x'.repeat(65)]) {
      await expect(h.service.block(ME, bad)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(h.prisma.member.findFirst).not.toHaveBeenCalled();
  });
});

describe('BlocksService.unblock', () => {
  it("lifts only the caller's own block, and asking twice is no error", async () => {
    const h = harness();

    await h.service.unblock(ME, 'mem_martin');
    h.prisma.memberBlock.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(h.service.unblock(ME, 'mem_martin')).resolves.toBeUndefined();

    expect(h.prisma.memberBlock.deleteMany).toHaveBeenCalledWith({
      where: { blockerMemberId: 'mem_me', blockedMemberId: 'mem_martin' },
    });
  });
});
