import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MemberRole, MemberStatus, VisibilityKind } from '@prisma/client';

import type { AuditService } from '../../common/audit.service';
import type { PrismaService } from '../../common/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';
import { FamiliesService, parseBirthDate } from './families.service';

/**
 * Families service tests.
 *
 * Three properties whose failure is silent and expensive:
 *   1. A family must never be left without an administrator — then nobody can
 *      invite, manage groups or cancel the subscription.
 *   2. A child profile must never be left without a responsible person.
 *   3. Deleting a group must not make events more visible than they were.
 */

function ctx(role: MemberRole = MemberRole.admin): ViewerContext {
  return { memberId: 'mem_admin', familyId: 'fam_1', role, groupIds: ['grp_parents'] };
}

interface MockOptions {
  member?: unknown;
  adminCount?: number;
  group?: unknown;
  eventsInGroup?: {
    id: string;
    visibility: { groupId: string | null; memberId?: string | null }[];
  }[];
}

function build(options: MockOptions = {}) {
  const tx = {
    event: {
      findMany: jest.fn().mockResolvedValue(options.eventsInGroup ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    family: {
      create: jest.fn().mockResolvedValue({ id: 'fam_new' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'fam_new', groups: [], members: [] }),
    },
    group: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'grp_new', ...data })),
      delete: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'grp_1', ...data })),
    },
    groupMember: {
      deleteMany: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    },
    member: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'mem_new', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'mem_x', ...data })),
    },
    invitation: { update: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    member: {
      findFirst: jest.fn().mockResolvedValue(options.member ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(options.adminCount ?? 2),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'mem_new', ...data })),
      update: jest.fn().mockImplementation(({ where, data }) =>
        Promise.resolve({ id: where.id, ...data }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    group: {
      findFirst: jest.fn().mockResolvedValue(options.group ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'grp_new', ...data })),
    },
    invitation: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'inv_1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'inv_1', ...data })),
    },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ displayName: 'Anna', locale: 'lv' }),
    },
    memberVisit: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    device: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    calendarFeed: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    family: {
      create: jest.fn().mockResolvedValue({ id: 'fam_new' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'fam_new', groups: [], members: [] }),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'fam_1', ...data })),
    },
    $transaction: jest.fn().mockImplementation((arg: unknown) =>
      typeof arg === 'function' ? (arg as (t: unknown) => unknown)(tx) : Promise.all(arg as unknown[]),
    ),
  };

  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const visibility = new VisibilityService(prisma as unknown as PrismaService);
  const notifications = { eventCreated: jest.fn(), commentAdded: jest.fn(), memberJoined: jest.fn() } as unknown as NotificationsService;
  const service = new FamiliesService(
    prisma as unknown as PrismaService,
    visibility,
    audit,
    notifications,
  );

  return { service, prisma, tx, audit, notifications };
}

// ---------------------------------------------------------------------------

describe("The family's name", () => {
  it('is trimmed when the family is made', async () => {
    const { service, tx } = build();
    await service.create('usr_1', { name: '  Bergu ģimene  ' });
    expect(tx.family.create).toHaveBeenCalledWith({ data: { name: 'Bergu ģimene', locale: 'lv' } });
  });

  it.each([
    ['blank', '   '],
    ['empty', ''],
    ['not text', 42],
    ['longer than the field', 'x'.repeat(61)],
  ])('is refused when %s, at creation', async (_, name) => {
    const { service, tx } = build();
    await expect(service.create('usr_1', { name: name as string })).rejects.toThrow(BadRequestException);
    expect(tx.family.create).not.toHaveBeenCalled();
  });

  it('a language the app does not speak is refused', async () => {
    const { service } = build();
    await expect(service.create('usr_1', { name: 'Bergi', locale: 'xx' })).rejects.toThrow(BadRequestException);
  });

  it('an administrator renames it', async () => {
    const { service, prisma } = build();
    await service.update(ctx(), { name: ' Ozoli ' });
    expect(prisma.family.update).toHaveBeenCalledWith({ where: { id: 'fam_1' }, data: { name: 'Ozoli' } });
  });

  it('a blank new name is refused, not saved as nothing', async () => {
    const { service, prisma } = build();
    await expect(service.update(ctx(), { name: '   ' })).rejects.toThrow(BadRequestException);
    expect(prisma.family.update).not.toHaveBeenCalled();
  });

  it('a member who is not an administrator cannot rename it', async () => {
    const { service, prisma } = build();
    await expect(service.update(ctx(MemberRole.member), { name: 'Ozoli' })).rejects.toThrow(ForbiddenException);
    expect(prisma.family.update).not.toHaveBeenCalled();
  });
});

describe('The last administrator', () => {
  const admin = { id: 'mem_other', role: MemberRole.admin, status: MemberStatus.active };

  it('the only administrator cannot be demoted', async () => {
    const { service } = build({ member: admin, adminCount: 1 });
    await expect(
      service.updateRole(ctx(), 'mem_other', MemberRole.member),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('with two administrators the role can be changed', async () => {
    const { service } = build({ member: admin, adminCount: 2 });
    await expect(service.updateRole(ctx(), 'mem_other', MemberRole.member)).resolves.toBeDefined();
  });

  it('the only administrator cannot be removed from the family', async () => {
    const { service } = build({ member: admin, adminCount: 1 });
    await expect(service.remove(ctx(), 'mem_other')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('promoting to administrator is never blocked', async () => {
    const { service } = build({
      member: { id: 'mem_other', role: MemberRole.member, status: MemberStatus.active },
      adminCount: 1,
    });
    await expect(service.updateRole(ctx(), 'mem_other', MemberRole.admin)).resolves.toBeDefined();
  });

  it('a role change reaches the audit log', async () => {
    const { service, audit } = build({ member: admin, adminCount: 2 });
    await service.updateRole(ctx(), 'mem_other', MemberRole.member);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'member.role_changed' }),
    );
  });
});

describe('Removing a member', () => {
  it('you cannot remove yourself', async () => {
    const { service } = build();
    await expect(service.remove(ctx(), 'mem_admin')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removal is a status change, not a deletion — the chronicle stays', async () => {
    const { service, prisma } = build({
      member: { id: 'mem_other', role: MemberRole.member, status: MemberStatus.active },
    });
    await service.remove(ctx(), 'mem_other');
    expect(prisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: MemberStatus.removed } }),
    );
  });

  it('a child profile is not left without a manager', async () => {
    const { service, prisma } = build({
      member: { id: 'mem_parent', role: MemberRole.member, status: MemberStatus.active },
    });
    await service.remove(ctx(), 'mem_parent');

    // Children managed by the removed member pass to whoever removes them.
    expect(prisma.member.updateMany).toHaveBeenCalledWith({
      where: { managedByMemberId: 'mem_parent' },
      data: { managedByMemberId: 'mem_admin' },
    });
  });

  it('a viewer cannot remove anybody', async () => {
    const { service } = build({
      member: { id: 'mem_other', role: MemberRole.member, status: MemberStatus.active },
    });
    await expect(service.remove(ctx(MemberRole.viewer), 'mem_other')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('Creating a child profile', () => {
  it('a child cannot manage another child', async () => {
    const { service } = build({
      member: { id: 'mem_child', role: MemberRole.child, status: MemberStatus.active },
    });
    await expect(
      service.createChild(ctx(), { displayName: 'Roberts', managedByMemberId: 'mem_child' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a viewer cannot be a manager', async () => {
    const { service } = build({
      member: { id: 'mem_viewer', role: MemberRole.viewer, status: MemberStatus.active },
    });
    await expect(
      service.createChild(ctx(), { displayName: 'Roberts', managedByMemberId: 'mem_viewer' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a member of another family cannot be a manager', async () => {
    const { service } = build({ member: null });
    await expect(
      service.createChild(ctx(), { displayName: 'Roberts', managedByMemberId: 'mem_foreign' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a created child always has a manager and no account', async () => {
    const { service, prisma } = build({
      member: { id: 'mem_admin', role: MemberRole.admin, status: MemberStatus.active },
    });
    await service.createChild(ctx(), { displayName: 'Roberts' });

    const data = prisma.member.create.mock.calls[0][0].data;
    expect(data.role).toBe(MemberRole.child);
    expect(data.userId).toBeNull();
    expect(data.managedByMemberId).toBe('mem_admin');
  });

  it('creating a child reaches the audit log', async () => {
    const { service, audit } = build({
      member: { id: 'mem_admin', role: MemberRole.admin, status: MemberStatus.active },
    });
    await service.createChild(ctx(), { displayName: 'Roberts' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'child_profile.updated' }),
    );
  });
});

describe('Grupas', () => {
  it('a system group cannot be deleted', async () => {
    const { service } = build({ group: { id: 'grp_parents', isSystem: true } });
    await expect(service.deleteGroup(ctx(), 'grp_parents')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('a system group cannot be renamed', async () => {
    const { service } = build({ group: { id: 'grp_parents', isSystem: true } });
    await expect(
      service.updateGroup(ctx(), 'grp_parents', { name: 'Cits nosaukums' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the members of a system group MAY be changed', async () => {
    const { service } = build({ group: { id: 'grp_parents', isSystem: true } });
    await expect(
      service.updateGroup(ctx(), 'grp_parents', { memberIds: ['mem_a'] }),
    ).resolves.toBeDefined();
  });

  it('a group that does not exist -> 404', async () => {
    const { service } = build({ group: null });
    await expect(service.deleteGroup(ctx(), 'grp_x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a viewer cannot create groups', async () => {
    const { service } = build();
    await expect(
      service.createGroup(ctx(MemberRole.viewer), { name: 'Sava grupa' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Deleting a group — FAIL CLOSED', () => {
  it('events that were visible ONLY to this group become private', async () => {
    const { service, tx } = build({
      group: { id: 'grp_x', isSystem: false },
      eventsInGroup: [{ id: 'evt_only', visibility: [{ groupId: 'grp_x' }] }],
    });

    await service.deleteGroup(ctx(), 'grp_x');

    expect(tx.event.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['evt_only'] } },
      data: { visibilityKind: VisibilityKind.private },
    });
  });

  it('events with another group stay group-visible instead of becoming private', async () => {
    const { service, tx } = build({
      group: { id: 'grp_x', isSystem: false },
      eventsInGroup: [
        { id: 'evt_shared', visibility: [{ groupId: 'grp_x' }, { groupId: 'grp_parents' }] },
      ],
    });

    await service.deleteGroup(ctx(), 'grp_x');
    expect(tx.event.updateMany).not.toHaveBeenCalled();
  });

  it('the mixed case: only the orphans become private', async () => {
    const { service, tx } = build({
      group: { id: 'grp_x', isSystem: false },
      eventsInGroup: [
        { id: 'evt_orphan', visibility: [{ groupId: 'grp_x' }] },
        { id: 'evt_shared', visibility: [{ groupId: 'grp_x' }, { groupId: 'grp_parents' }] },
      ],
    });

    await service.deleteGroup(ctx(), 'grp_x');
    expect(tx.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['evt_orphan'] } } }),
    );
  });

  it('looks at custom audiences too, not only group-only ones', async () => {
    const { service, tx } = build({ group: { id: 'grp_x', isSystem: false } });
    await service.deleteGroup(ctx(), 'grp_x');

    const where = tx.event.findMany.mock.calls[0][0].where;
    expect(where.visibilityKind).toEqual({
      in: [VisibilityKind.groups, VisibilityKind.custom],
    });
  });

  it('a custom audience that also names a person keeps that person', async () => {
    const { service, tx } = build({
      group: { id: 'grp_x', isSystem: false },
      eventsInGroup: [
        { id: 'evt_custom', visibility: [{ groupId: 'grp_x' }, { groupId: null, memberId: 'mem_vija' }] },
      ],
    });

    await service.deleteGroup(ctx(), 'grp_x');
    expect(tx.event.updateMany).not.toHaveBeenCalled();
  });

  it('the group is deleted only after the events have been dealt with', async () => {
    const { service, tx } = build({
      group: { id: 'grp_x', isSystem: false },
      eventsInGroup: [{ id: 'evt_only', visibility: [{ groupId: 'grp_x' }] }],
    });

    await service.deleteGroup(ctx(), 'grp_x');

    const updateOrder = tx.event.updateMany.mock.invocationCallOrder[0];
    const deleteOrder = tx.group.delete.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(deleteOrder);
  });
});

describe('In memoriam', () => {
  const vera = {
    id: 'mem_vera',
    role: MemberRole.viewer,
    status: MemberStatus.active,
    userId: 'usr_vera',
    birthDate: new Date('1950-11-20T10:00:00Z'),
  };

  it('keeps the profile and marks the day', async () => {
    const { service, prisma } = build({ member: vera });
    await service.setDiedOn(ctx(), 'mem_vera', '2026-03-02T12:00:00.000Z');

    expect(prisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mem_vera' },
        data: { diedOn: new Date('2026-03-02T12:00:00.000Z') },
      }),
    );
    // Not removed: the chronicle is about them too.
    expect(prisma.member.update.mock.calls[0][0].data).not.toHaveProperty('status');
  });

  it('ends every session of the account, so nobody else signs in as them', async () => {
    const { service, prisma } = build({ member: vera });
    await service.setDiedOn(ctx(), 'mem_vera', '2026-03-02T12:00:00.000Z');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'usr_vera', revokedAt: null } }),
    );
    expect(prisma.calendarFeed.deleteMany).toHaveBeenCalledWith({ where: { memberId: 'mem_vera' } });
  });

  it('can be taken back, and both are written down', async () => {
    const { service, prisma, audit } = build({ member: vera });
    await service.setDiedOn(ctx(), 'mem_vera', null);

    expect(prisma.member.update.mock.calls[0][0].data).toEqual({ diedOn: null });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'member.unmarked_deceased' }),
    );
  });

  it('is an admin decision', async () => {
    const { service } = build({ member: vera });
    await expect(
      service.setDiedOn(ctx(MemberRole.member), 'mem_vera', '2026-03-02T12:00:00.000Z'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('is never about yourself', async () => {
    const { service } = build({ member: vera });
    await expect(service.setDiedOn(ctx(), 'mem_admin', '2026-03-02T12:00:00.000Z')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a day before they were born', async () => {
    const { service } = build({ member: vera });
    await expect(service.setDiedOn(ctx(), 'mem_vera', '1949-01-01T12:00:00.000Z')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('leaves the family an admin who is alive', async () => {
    const lastAdmin = { ...vera, role: MemberRole.admin };
    const { service } = build({ member: lastAdmin, adminCount: 1 });
    await expect(
      service.setDiedOn(ctx(), 'mem_vera', '2026-03-02T12:00:00.000Z'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('A visit', () => {
  it('the first one has nothing before it', async () => {
    const { service, prisma } = build();
    await expect(service.markSeen(ctx())).resolves.toEqual({ previousSeenAt: null });
    expect(prisma.memberVisit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { memberId: 'mem_admin' } }),
    );
  });

  it('answers with when the previous one began, and moves the mark to now', async () => {
    const { service, prisma } = build();
    const tuesday = new Date('2026-09-22T07:30:00.000Z');
    prisma.memberVisit.findUnique.mockResolvedValue({ lastSeenAt: tuesday });

    const before = Date.now();
    await expect(service.markSeen(ctx())).resolves.toEqual({
      previousSeenAt: tuesday.toISOString(),
    });

    const written = prisma.memberVisit.upsert.mock.calls[0][0].update.lastSeenAt as Date;
    expect(written.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('is only ever about the person asking', async () => {
    const { service, prisma } = build();
    await service.markSeen(ctx(MemberRole.viewer));
    expect(prisma.memberVisit.findUnique.mock.calls[0][0].where).toEqual({ memberId: 'mem_admin' });
  });
});

describe('Invitations', () => {
  it('a child is not invited — a child profile is created', async () => {
    const { service } = build();
    await expect(service.invite(ctx(), { role: MemberRole.child })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('a viewer cannot invite', async () => {
    const { service } = build();
    await expect(
      service.invite(ctx(MemberRole.viewer), { role: MemberRole.member }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the code has the format FAM-XXXX with no ambiguous characters', async () => {
    const { service, prisma } = build();
    await service.invite(ctx(), { role: MemberRole.viewer });

    const code = prisma.invitation.create.mock.calls[0][0].data.code as string;
    expect(code).toMatch(/^FAM-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    // 0/O and 1/I are excluded, because the code gets read out over the phone.
    expect(code).not.toMatch(/[01OI]/);
  });

  it('the email is normalised to lower case', async () => {
    const { service, prisma } = build();
    await service.invite(ctx(), { email: '  Janis.Kalnins@Example.LV ', role: MemberRole.viewer });
    expect(prisma.invitation.create.mock.calls[0][0].data.email).toBe('janis.kalnins@example.lv');
  });

  it('the preview reveals nothing beyond the name and the role', async () => {
    const { service, prisma } = build();
    prisma.invitation.findUnique.mockResolvedValue({
      role: MemberRole.viewer,
      expiresAt: new Date(Date.now() + 864e5),
      acceptedAt: null,
      revokedAt: null,
      family: { name: 'The Bergs' },
    });

    const preview = await service.previewInvitation('fam-j4k7');
    expect(Object.keys(preview).sort()).toEqual(['familyName', 'role']);
  });

  it('an expired invitation -> 404', async () => {
    const { service, prisma } = build();
    prisma.invitation.findUnique.mockResolvedValue({
      role: MemberRole.viewer,
      expiresAt: new Date(Date.now() - 1000),
      acceptedAt: null,
      revokedAt: null,
      family: { name: 'X' },
    });
    await expect(service.previewInvitation('FAM-OLD')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('an already accepted invitation stops working', async () => {
    const { service, prisma } = build();
    prisma.invitation.findUnique.mockResolvedValue({
      id: 'inv_1',
      familyId: 'fam_1',
      groupIds: [],
      role: MemberRole.viewer,
      expiresAt: new Date(Date.now() + 864e5),
      acceptedAt: new Date(),
      revokedAt: null,
    });
    await expect(service.acceptInvitation('usr_x', 'FAM-USED')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('re-joining a family restores the old record instead of creating a new one', async () => {
    const { service, prisma, tx } = build();
    prisma.invitation.findUnique.mockResolvedValue({
      id: 'inv_1',
      familyId: 'fam_1',
      groupIds: [],
      role: MemberRole.viewer,
      expiresAt: new Date(Date.now() + 864e5),
      acceptedAt: null,
      revokedAt: null,
    });
    tx.member.findFirst.mockResolvedValue({ id: 'mem_old' });

    await service.acceptInvitation('usr_x', 'FAM-BACK');

    expect(tx.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mem_old' },
        data: { status: MemberStatus.active, role: MemberRole.viewer },
      }),
    );
    expect(tx.member.create).not.toHaveBeenCalled();
  });
});

/**
 * "About you" asks for a birthday before there is a family, and for as long as
 * nothing carried it across, every adult's birthday was dropped on the way to
 * the member row. These pin both ways a member row is born.
 */
describe('The birthday from "About you"', () => {
  const invitation = {
    id: 'inv_1',
    familyId: 'fam_1',
    groupIds: [],
    role: MemberRole.member,
    expiresAt: new Date(Date.now() + 864e5),
    acceptedAt: null,
    revokedAt: null,
  };
  const birthday = new Date(1970, 2, 14, 12).toISOString();

  it("lands on the creator's member row", async () => {
    const { service, tx } = build();
    await service.create('usr_anna', { name: 'The Bergs', birthDate: birthday });

    const data = tx.member.create.mock.calls[0][0].data;
    expect(data.role).toBe(MemberRole.admin);
    expect(data.birthDate).toEqual(new Date(birthday));
  });

  it('lands on the row of somebody joining', async () => {
    const { service, prisma, tx } = build();
    prisma.invitation.findUnique.mockResolvedValue(invitation);

    await service.acceptInvitation('usr_vera', 'FAM-J4K7', { birthDate: birthday });

    expect(tx.member.create.mock.calls[0][0].data.birthDate).toEqual(new Date(birthday));
  });

  it('is left alone on a re-join that does not bring one', async () => {
    const { service, prisma, tx } = build();
    prisma.invitation.findUnique.mockResolvedValue(invitation);
    tx.member.findFirst.mockResolvedValue({ id: 'mem_old' });

    await service.acceptInvitation('usr_vera', 'FAM-BACK');

    expect(tx.member.update.mock.calls[0][0].data).not.toHaveProperty('birthDate');
  });

  it('is optional', async () => {
    const { service, tx } = build();
    await service.create('usr_anna', { name: 'The Bergs' });
    expect(tx.member.create.mock.calls[0][0].data.birthDate).toBeNull();
  });

  it('is refused before anything is written when it is not a real day', async () => {
    const { service, prisma } = build();
    await expect(
      service.create('usr_anna', { name: 'The Bergs', birthDate: 'last spring' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('parseBirthDate', () => {
  function refusal(value: unknown): string | undefined {
    try {
      parseBirthDate(value);
      return undefined;
    } catch (error) {
      return ((error as BadRequestException).getResponse() as { code: string }).code;
    }
  }

  it('reads nothing as no birthday', () => {
    expect(parseBirthDate(undefined)).toBeNull();
    expect(parseBirthDate(null)).toBeNull();
    expect(parseBirthDate('')).toBeNull();
  });

  it('takes an ISO date', () => {
    expect(parseBirthDate('1970-03-14T10:00:00.000Z')).toEqual(new Date('1970-03-14T10:00:00.000Z'));
  });

  it('refuses what is not a date, with a code the client can name', () => {
    expect(refusal('14/03/70 or so')).toBe('invalid_birth_date');
    expect(refusal(19700314)).toBe('invalid_birth_date');
  });

  it('refuses the future and the implausibly old', () => {
    expect(refusal(new Date(Date.now() + 3 * 864e5).toISOString())).toBe('invalid_birth_date');
    expect(refusal('1850-01-01T12:00:00.000Z')).toBe('invalid_birth_date');
  });

  it('accepts today picked west of here, which is still ahead of the server clock', () => {
    // The app stores a picked day at local noon; at UTC−11 that is 23:00 UTC.
    expect(refusal(new Date(Date.now() + 11 * 36e5).toISOString())).toBeUndefined();
  });
});

describe('Your own profile', () => {
  /** The array form of $transaction, which this path uses. */
  function withProfile() {
    const built = build();
    const prisma = built.prisma as unknown as Record<string, Record<string, jest.Mock> | jest.Mock>;

    (prisma.member as Record<string, jest.Mock>).findUniqueOrThrow = jest
      .fn()
      .mockResolvedValue({ userId: 'usr_1' });
    (prisma.user as Record<string, jest.Mock>).update = jest.fn().mockResolvedValue({});
    prisma.$transaction = jest.fn().mockImplementation((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (t: unknown) => unknown)(built.tx),
    );

    return built;
  }

  it('renames the row everybody sees, and the account with it', async () => {
    const { service, prisma } = withProfile();

    await service.updateOwnProfile(ctx(MemberRole.viewer), { displayName: '  Vera Berga  ' });

    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: 'mem_admin' },
      data: { displayName: 'Vera Berga' },
    });
    expect((prisma.user as unknown as Record<string, jest.Mock>).update).toHaveBeenCalledWith({
      where: { id: 'usr_1' },
      data: { displayName: 'Vera Berga' },
    });
  });

  it('only ever touches the row of whoever is asking', async () => {
    const { service, prisma } = withProfile();

    await service.updateOwnProfile(ctx(MemberRole.admin), { birthDate: '1990-03-14T10:00:00.000Z' });

    // No member id travels in the request: an admin cannot edit somebody
    // else's birthday through this door.
    expect(prisma.member.update.mock.calls[0][0].where).toEqual({ id: 'mem_admin' });
  });

  it('refuses a one-letter name', async () => {
    const { service } = withProfile();

    await expect(service.updateOwnProfile(ctx(), { displayName: 'V' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lets a birthday be taken away again', async () => {
    const { service, prisma } = withProfile();

    await service.updateOwnProfile(ctx(), { birthDate: null });

    expect(prisma.member.update.mock.calls[0][0].data).toEqual({ birthDate: null });
  });

  it('refuses a birthday in the future', async () => {
    const { service } = withProfile();

    await expect(
      service.updateOwnProfile(ctx(), { birthDate: '2999-01-01T12:00:00.000Z' }),
    ).rejects.toMatchObject({ response: { code: 'invalid_birth_date' } });
  });

  it('says so when there is nothing to change', async () => {
    const { service } = withProfile();

    await expect(service.updateOwnProfile(ctx(), {})).rejects.toMatchObject({
      response: { code: 'nothing_to_update' },
    });
  });
});

describe('What somebody likes', () => {
  function withProfile() {
    const built = build();
    const prisma = built.prisma as unknown as Record<string, Record<string, jest.Mock> | jest.Mock>;
    (prisma.member as Record<string, jest.Mock>).findUniqueOrThrow = jest
      .fn()
      .mockResolvedValue({ userId: 'usr_1' });
    (prisma.user as Record<string, jest.Mock>).update = jest.fn().mockResolvedValue({});
    prisma.$transaction = jest.fn().mockImplementation((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (t: unknown) => unknown)(built.tx),
    );
    return built;
  }

  const child = (managedByMemberId: string) => ({
    id: 'mem_child',
    familyId: 'fam_1',
    role: MemberRole.child,
    status: MemberStatus.active,
    managedByMemberId,
  });

  it('keeps your own, known keys only and each once', async () => {
    const { service, prisma } = withProfile();

    await service.updateOwnProfile(ctx(MemberRole.viewer), {
      interests: ['garden', 'garden', 'astrology', 'reading'],
    });

    expect(prisma.member.update.mock.calls[0][0].data).toEqual({ interests: ['garden', 'reading'] });
  });

  it('refuses interests that are not a list', async () => {
    const { service } = withProfile();

    await expect(service.updateOwnProfile(ctx(), { interests: 'garden' })).rejects.toMatchObject({
      response: { code: 'invalid_interests' },
    });
  });

  it("lets the parent who manages a child's profile say what the child likes, and audits it", async () => {
    const { service, prisma, audit } = build({ member: child('mem_admin') });

    await service.updateChildInterests(ctx(MemberRole.member), 'mem_child', ['building', 'animals']);

    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: 'mem_child' },
      data: { interests: ['building', 'animals'] },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'child_profile.updated', entityId: 'mem_child' }),
    );
  });

  it('lets an admin do it for any child', async () => {
    const { service, prisma } = build({ member: child('mem_somebody_else') });

    await service.updateChildInterests(ctx(MemberRole.admin), 'mem_child', ['drawing']);

    expect(prisma.member.update).toHaveBeenCalled();
  });

  it('refuses an adult who does not manage the child', async () => {
    const { service, prisma } = build({ member: child('mem_somebody_else') });

    await expect(
      service.updateChildInterests(ctx(MemberRole.member), 'mem_child', ['drawing']),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  it("does not set an adult's for them - they say it themselves", async () => {
    const { service } = build({
      member: { id: 'mem_vera', familyId: 'fam_1', role: MemberRole.member, status: MemberStatus.active },
    });

    await expect(
      service.updateChildInterests(ctx(MemberRole.admin), 'mem_vera', ['garden']),
    ).rejects.toMatchObject({ response: { code: 'not_a_child_profile' } });
  });

  it('gives the one who creates a family what they chose during onboarding', async () => {
    const { service, tx } = build();

    await service.create('usr_1', { name: 'The Kalnins', interests: ['music', 'nope'] });

    expect(tx.member.create.mock.calls[0][0].data.interests).toEqual(['music']);
  });
});
