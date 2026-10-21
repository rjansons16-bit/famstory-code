import { MemberRole } from '@prisma/client';

import type { AuditService } from '../../common/audit.service';
import type { PrismaService } from '../../common/prisma.service';
import type { ViewerContext } from '../visibility/visibility.service';
import { WishesService } from './wishes.service';

/**
 * The one rule that makes a wish list worth having: the person it is for
 * sees only their own lines and never the claims. Everything here is a way
 * that rule could leak.
 */

const ANNA: ViewerContext = { memberId: 'mem_anna', familyId: 'fam_1', role: MemberRole.admin, groupIds: [] };
const VERA: ViewerContext = { memberId: 'mem_vera', familyId: 'fam_1', role: MemberRole.viewer, groupIds: [] };

const rows = [
  { id: 'w1', forMemberId: 'mem_anna', text: 'A warm scarf', addedByMemberId: 'mem_anna', claimedByMemberId: 'mem_vera', createdAt: new Date(), deletedAt: null },
  { id: 'w2', forMemberId: 'mem_anna', text: 'The blue one from Cēsis', addedByMemberId: 'mem_vera', claimedByMemberId: null, createdAt: new Date(), deletedAt: null },
];

function build(options: { ownerRole?: MemberRole } = {}) {
  const prisma = {
    member: {
      findFirst: jest.fn().mockResolvedValue({ id: 'mem_anna', role: options.ownerRole ?? MemberRole.admin }),
    },
    wishItem: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { addedByMemberId?: string } }) =>
        Promise.resolve(rows.filter((r) => !where.addedByMemberId || r.addedByMemberId === where.addedByMemberId)),
      ),
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
      ),
      count: jest.fn().mockResolvedValue(2),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'w3', createdAt: new Date(), ...data })),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new WishesService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  return { service, prisma, audit };
}

describe('Reading a wish list', () => {
  it('the person it is for sees only what they wrote, and no claims', async () => {
    const { service, prisma } = build();
    const list = await service.list(ANNA, 'mem_anna');

    // Filtered in the query, so the others' ideas are never even loaded.
    expect(prisma.wishItem.findMany.mock.calls[0][0].where.addedByMemberId).toBe('mem_anna');
    expect(list.map((w) => w.id)).toEqual(['w1']);
    expect(list[0].claimedByMemberId).toBeNull();
  });

  it('everybody else sees every line and who is getting what', async () => {
    const { service } = build();
    const list = await service.list(VERA, 'mem_anna');
    expect(list.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(list[0].claimedByMemberId).toBe('mem_vera');
  });

  it("reading a child's list is written down like any child's data", async () => {
    const { service, audit } = build({ ownerRole: MemberRole.child });
    await service.list(VERA, 'mem_anna');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'child_profile.viewed', entityType: 'WishList' }),
    );
  });
});

describe('Claiming', () => {
  it("nobody claims from their own list - they cannot see the claims", async () => {
    const { service } = build();
    await expect(service.toggleClaim(ANNA, 'w1')).rejects.toMatchObject({ status: 403 });
  });

  it('the owner cannot even find an idea somebody else wrote for them', async () => {
    const { service } = build();
    await expect(service.remove(ANNA, 'w2')).rejects.toMatchObject({ status: 404 });
  });

  it('a line somebody else is getting cannot be taken', async () => {
    const { service } = build();
    const martin = { ...VERA, memberId: 'mem_martin' };
    await expect(service.toggleClaim(martin, 'w1')).rejects.toMatchObject({ status: 409 });
  });

  it('pressing again lets go of your own claim', async () => {
    const { service, prisma } = build();
    const result = await service.toggleClaim(VERA, 'w1');
    expect(result.claimedByMemberId).toBeNull();
    // Only if it is still hers: two presses at once cannot both win.
    expect(prisma.wishItem.updateMany.mock.calls[0][0].where).toEqual({ id: 'w1', claimedByMemberId: 'mem_vera' });
  });
});

describe('Adding', () => {
  it('keeps the words, tidied', async () => {
    const { service } = build();
    const wish = await service.add(VERA, 'mem_anna', '  a   warm   scarf ');
    expect(wish.text).toBe('a warm scarf');
  });

  it('refuses an empty line and a novel', async () => {
    const { service } = build();
    await expect(service.add(VERA, 'mem_anna', ' ')).rejects.toMatchObject({ status: 400 });
    await expect(service.add(VERA, 'mem_anna', 'x'.repeat(201))).rejects.toMatchObject({ status: 400 });
  });

  it('a child profile does not write', async () => {
    const { service } = build();
    const child = { ...VERA, role: MemberRole.child };
    await expect(service.add(child, 'mem_anna', 'A bike')).rejects.toMatchObject({ status: 403 });
  });

  it('a gift idea taken from the suggestions is yours the moment it is written', async () => {
    const { service, prisma } = build();

    const wish = await service.add(VERA, 'mem_anna', 'Garden gloves and a trowel', true);

    expect(prisma.wishItem.create.mock.calls[0][0].data.claimedByMemberId).toBe('mem_vera');
    expect(wish.claimedByMemberId).toBe('mem_vera');
  });

  it('nobody claims on their own list, even this way', async () => {
    const { service, prisma } = build();

    const wish = await service.add(ANNA, 'mem_anna', 'A warm scarf', true);

    expect(prisma.wishItem.create.mock.calls[0][0].data.claimedByMemberId).toBeNull();
    expect(wish.claimedByMemberId).toBeNull();
  });
});
