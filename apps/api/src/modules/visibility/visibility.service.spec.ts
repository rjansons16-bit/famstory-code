import { ForbiddenException } from '@nestjs/common';
import { MemberRole, VisibilityKind } from '@prisma/client';

import type { PrismaService } from '../../common/prisma.service';
import { VisibilityService, type ViewerContext } from './visibility.service';

/**
 * Visibility layer tests without a database.
 *
 * `eventFilter()` returns a Prisma `where` object — that can be checked
 * structurally, and the structure is exactly what decides whether a hidden
 * event reaches the response. The real SQL is checked by the integration tests
 * against a live database (stage D).
 */

function ctx(overrides: Partial<ViewerContext> = {}): ViewerContext {
  return {
    memberId: 'mem_anna',
    familyId: 'fam_1',
    role: MemberRole.admin,
    groupIds: ['grp_parents'],
    ...overrides,
  };
}

function prismaMock(member: unknown): PrismaService {
  return {
    member: { findFirst: jest.fn().mockResolvedValue(member) },
    event: { findFirst: jest.fn().mockResolvedValue(null) },
    group: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
}

describe('VisibilityService.eventFilter', () => {
  const service = new VisibilityService(prismaMock(null));

  it('always pins familyId and excludes deleted events', () => {
    const filter = service.eventFilter(ctx());
    expect(filter.familyId).toBe('fam_1');
    expect(filter.deletedAt).toBeNull();
  });

  it('the OR holds exactly four branches and none of them may be lost', () => {
    const or = service.eventFilter(ctx()).OR;
    expect(Array.isArray(or)).toBe(true);
    expect(or).toHaveLength(4);
  });

  it('the author branch comes first — a private event stays visible to its author', () => {
    const or = service.eventFilter(ctx()).OR as Record<string, unknown>[];
    expect(or[0]).toEqual({ authorMemberId: 'mem_anna' });
  });

  it('the group branch uses only the viewer\'s own groups', () => {
    const or = service.eventFilter(ctx({ groupIds: ['a', 'b'] })).OR as Record<string, unknown>[];
    expect(or[2]).toEqual({
      // `custom` rides along: it can carry group rows too.
      visibilityKind: { in: [VisibilityKind.custom, VisibilityKind.groups] },
      visibility: { some: { groupId: { in: ['a', 'b'] } } },
    });
  });

  it('with no groups the group branch opens nothing', () => {
    const or = service.eventFilter(ctx({ groupIds: [] })).OR as Record<string, unknown>[];
    expect(or[2]).toEqual({
      visibilityKind: { in: [VisibilityKind.custom, VisibilityKind.groups] },
      visibility: { some: { groupId: { in: [] } } },
    });
  });

  it('custom is reachable through BOTH the group and the member branch', () => {
    // The design lets one audience hold groups and people at once. If `custom`
    // sat on only one branch, half of every mixed audience would go dark — and
    // silently, which is the worst way for this particular thing to fail.
    const or = service.eventFilter(ctx({ groupIds: ['a'] })).OR as Record<string, unknown>[];
    const carries = or.filter((branch) => {
      const kind = branch.visibilityKind as { in?: string[] } | undefined;
      return Array.isArray(kind?.in) && kind.in.includes(VisibilityKind.custom);
    });
    expect(carries).toHaveLength(2);
  });

  it('FAIL CLOSED: private has no branch of its own — only the author condition covers it', () => {
    const or = service.eventFilter(ctx()).OR as Record<string, unknown>[];
    expect(JSON.stringify(or.map((branch) => branch.visibilityKind))).not.toContain(
      VisibilityKind.private,
    );
  });
});

describe('VisibilityService.contextFor', () => {
  it('returns the role and groups for an active member', async () => {
    const service = new VisibilityService(
      prismaMock({
        id: 'mem_vija',
        role: MemberRole.viewer,
        groupLinks: [{ groupId: 'grp_grandparents' }],
      }),
    );

    await expect(service.contextFor('usr_vija', 'fam_1')).resolves.toEqual({
      memberId: 'mem_vija',
      familyId: 'fam_1',
      role: MemberRole.viewer,
      groupIds: ['grp_grandparents'],
    });
  });

  it('throws 403 for another family without revealing whether it exists', async () => {
    const service = new VisibilityService(prismaMock(null));
    await expect(service.contextFor('usr_x', 'fam_2')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('VisibilityService.can', () => {
  const service = new VisibilityService(prismaMock(null));

  it('an admin may do everything management-related', () => {
    const admin = ctx({ role: MemberRole.admin });
    expect(service.can(admin, 'member.invite')).toBe(true);
    expect(service.can(admin, 'event.edit_any')).toBe(true);
    expect(service.can(admin, 'subscription.manage')).toBe(true);
  });

  it('a member may not edit other people\'s events', () => {
    const member = ctx({ role: MemberRole.member });
    expect(service.can(member, 'event.create')).toBe(true);
    expect(service.can(member, 'event.edit_any')).toBe(false);
    expect(service.can(member, 'member.invite')).toBe(false);
  });

  it('a viewer writes no events', () => {
    const viewer = ctx({ role: MemberRole.viewer });
    expect(service.can(viewer, 'comment.create')).toBe(true);
    expect(service.can(viewer, 'event.create')).toBe(false);
  });

  it('a child can only react', () => {
    const child = ctx({ role: MemberRole.child });
    expect(service.can(child, 'reaction.create')).toBe(true);
    expect(service.can(child, 'comment.create')).toBe(false);
    expect(service.can(child, 'event.create')).toBe(false);
  });

  it('assertCan throws 403 instead of returning false', () => {
    expect(() => service.assertCan(ctx({ role: MemberRole.viewer }), 'event.create')).toThrow(
      ForbiddenException,
    );
  });
});

describe('VisibilityService.defaultVisibilityFor', () => {
  function serviceWith(childCount: number, parentsGroupId: string | null) {
    return new VisibilityService({
      member: { count: jest.fn().mockResolvedValue(childCount) },
      group: {
        findFirst: jest.fn().mockResolvedValue(parentsGroupId ? { id: parentsGroupId } : null),
      },
    } as unknown as PrismaService);
  }

  it('a child among the participants narrows visibility to Parents', async () => {
    const service = serviceWith(1, 'grp_parents');
    await expect(service.defaultVisibilityFor('fam_1', ['mem_child'])).resolves.toEqual({
      kind: VisibilityKind.groups,
      groupIds: ['grp_parents'],
    });
  });

  it('with no child it stays the whole family', async () => {
    const service = serviceWith(0, 'grp_parents');
    await expect(service.defaultVisibilityFor('fam_1', ['mem_adult'])).resolves.toEqual({
      kind: VisibilityKind.family,
    });
  });

  it('an empty participant list does not query the database at all', async () => {
    const service = serviceWith(0, 'grp_parents');
    await expect(service.defaultVisibilityFor('fam_1', [])).resolves.toEqual({
      kind: VisibilityKind.family,
    });
  });

  it('with no Parents group a child\'s event falls back to its author, not to the family', async () => {
    // It used to fall back to the whole family: an unplanned state that opened
    // a child's event to everybody. Fail closed means the narrowest audience.
    const service = serviceWith(1, null);
    await expect(service.defaultVisibilityFor('fam_1', ['mem_child'])).resolves.toEqual({
      kind: VisibilityKind.private,
    });
  });
});

describe('Surprises and time capsules', () => {
  const service = new VisibilityService(prismaMock(null));
  const now = new Date('2026-09-26T12:00:00Z');

  it('a surprise is kept from its person before every other rule, written without a NOT', () => {
    const filter = service.eventFilter(ctx({ memberId: 'mem_vera' }), now);
    // Three ways to pass, each positive: SQL's NOT over a NULL column is NULL,
    // and a NOT would have hidden every ordinary event from everybody.
    expect((filter.AND as unknown[])[0]).toEqual({
      OR: [
        { hiddenFromMemberId: null },
        { hiddenFromMemberId: { not: 'mem_vera' } },
        { revealAt: { lte: now } },
      ],
    });
    expect(JSON.stringify(filter)).not.toContain('"NOT"');
  });

  it('the author branch cannot open a surprise: it sits beside the four, not among them', () => {
    const filter = service.eventFilter(ctx(), now);
    expect(filter.OR).toHaveLength(4);
    expect(filter.AND).toHaveLength(2);
  });

  it('a capsule is closed to everybody but its author until its day', () => {
    const capsule = { sealedUntil: new Date('2030-01-01T00:00:00Z'), authorMemberId: 'mem_anna' };
    expect(service.isSealedFor(ctx({ memberId: 'mem_martin' }), capsule, now)).toBe(true);
    expect(service.isSealedFor(ctx({ memberId: 'mem_anna' }), capsule, now)).toBe(false);
    expect(service.isSealedFor(ctx({ memberId: 'mem_martin' }), capsule, new Date('2030-01-02'))).toBe(false);
    expect(service.isSealedFor(ctx(), { sealedUntil: null, authorMemberId: 'x' }, now)).toBe(false);
  });

  it('seeing a closed capsule is not opening it', async () => {
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue({ id: 'evt_1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          sealedUntil: new Date(Date.now() + 86_400_000),
          authorMemberId: 'mem_anna',
        }),
      },
    } as unknown as PrismaService;
    const gate = new VisibilityService(prisma);

    await expect(gate.assertCanOpenEvent(ctx({ memberId: 'mem_martin' }), 'evt_1')).rejects.toMatchObject({
      response: { code: 'capsule_sealed' },
    });
    await expect(gate.assertCanOpenEvent(ctx({ memberId: 'mem_anna' }), 'evt_1')).resolves.toBeUndefined();
  });
});

describe('Blocks', () => {
  const service = new VisibilityService(prismaMock(null));

  it("what somebody the viewer blocked wrote is filtered out, as the viewer's own question", () => {
    const filter = service.eventFilter(ctx({ memberId: 'mem_vera' }));
    expect((filter.AND as unknown[])[1]).toEqual({
      author: { blockedBy: { none: { blockerMemberId: 'mem_vera' } } },
    });
  });

  it('it sits beside the four branches, so no audience can bring a blocked author back', () => {
    const filter = service.eventFilter(ctx());
    expect(filter.OR).toHaveLength(4);
    expect(JSON.stringify(filter.OR)).not.toContain('blockedBy');
  });

  it('written without a NOT: "none" is NOT EXISTS, which never meets a null', () => {
    expect(JSON.stringify(service.eventFilter(ctx()).AND)).not.toContain('"NOT"');
  });
});
