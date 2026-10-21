import type { AuditService } from '../../common/audit.service';
import { ANONYMISED_NAME, purgeDueAt, withinGrace } from '../../common/deletion';
import type { PrismaService } from '../../common/prisma.service';
import type { StorageService } from '../../common/storage/storage.service';
import { AccountService } from './account.service';

/**
 * Deleting an account and taking a copy of it out.
 *
 * Both are obligations rather than features, and both are one-way enough to be
 * worth pinning: an export that carries somebody else's address is a data
 * breach with a download button, and a purge that deletes a member row instead
 * of anonymising it takes a family's chronicle apart to remove one person.
 */

const DAY = 24 * 60 * 60 * 1000;

function build() {
  const tx = {
    member: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    user: { delete: jest.fn().mockResolvedValue({}) },
    memberVisit: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    calendarFeed: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    memberBlock: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };

  const prisma = {
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'usr_1',
        email: 'anna@example.com',
        displayName: 'Anna',
        avatarUrl: null,
        locale: 'en',
        createdAt: new Date(),
        emailVerifiedAt: null,
        deletedAt: null,
      }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    member: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    event: { findMany: jest.fn().mockResolvedValue([]) },
    comment: { findMany: jest.fn().mockResolvedValue([]) },
    reaction: { findMany: jest.fn().mockResolvedValue([]) },
    invitation: { findMany: jest.fn().mockResolvedValue([]) },
    memberBlock: { findMany: jest.fn().mockResolvedValue([]) },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    device: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    family: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: typeof tx) => Promise<unknown>)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };

  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const storage = { remove: jest.fn().mockResolvedValue(undefined) };

  return {
    prisma,
    tx,
    audit,
    storage,
    service: new AccountService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      storage as unknown as StorageService,
    ),
  };
}

describe('The grace period', () => {
  it('lasts 30 days from the day it was asked for', () => {
    const deletedAt = new Date('2026-01-01T10:00:00.000Z');

    expect(purgeDueAt(deletedAt).toISOString()).toBe('2026-01-31T10:00:00.000Z');
  });

  it('is still open on day 29 and closed on day 31', () => {
    const deletedAt = new Date('2026-01-01T10:00:00.000Z');

    expect(withinGrace(deletedAt, new Date(deletedAt.getTime() + 29 * DAY))).toBe(true);
    expect(withinGrace(deletedAt, new Date(deletedAt.getTime() + 31 * DAY))).toBe(false);
  });
});

describe('Exporting', () => {
  it('carries the account and what it wrote', async () => {
    const { service, prisma } = build();
    prisma.member.findMany.mockResolvedValue([
      {
        id: 'mem_1',
        familyId: 'fam_1',
        displayName: 'Anna',
        avatarUrl: null,
        birthDate: null,
        role: 'admin',
        status: 'active',
        joinedAt: new Date(),
        family: { id: 'fam_1', name: 'The Bergs', createdAt: new Date() },
      },
    ]);
    prisma.comment.findMany.mockResolvedValue([
      { id: 'cmt_1', eventId: 'evt_1', body: 'Lovely', createdAt: new Date(), deletedAt: null },
    ]);

    const file = await service.exportFor('usr_1');

    expect(file.format).toBe('famstory.export.v1');
    expect(file.families).toHaveLength(1);
    expect(file.comments).toHaveLength(1);
  });

  it('names the people in an event without exporting them', async () => {
    const { service, prisma } = build();
    prisma.member.findMany.mockResolvedValue([{ id: 'mem_1', family: {} }]);
    prisma.event.findMany.mockResolvedValue([
      {
        id: 'evt_1',
        title: 'Beach afternoon',
        participants: [{ member: { displayName: 'Martin' } }],
        attachments: [],
      },
    ]);

    const file = await service.exportFor('usr_1');

    // A display name, because it is on the user's own event. Nothing else
    // about Martin - his address and birthday are his to export, not hers.
    expect(file.events).toEqual([
      expect.objectContaining({ participants: ['Martin'] }),
    ]);
  });

  it('is written down as a copy of personal data leaving', async () => {
    const { service, audit } = build();

    await service.exportFor('usr_1');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'export.requested', userId: 'usr_1' }),
    );
  });
});

describe('Asking for deletion', () => {
  it('marks the account and says when the data goes', async () => {
    const { service, prisma } = build();

    const { deletedAt, purgeAt } = await service.requestDeletion('usr_1');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'usr_1' } }),
    );
    expect(purgeAt.getTime() - deletedAt.getTime()).toBe(30 * DAY);
  });

  it('ends every session and every push token at once', async () => {
    const { service, prisma } = build();

    await service.requestDeletion('usr_1');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    expect(prisma.device.deleteMany).toHaveBeenCalledWith({ where: { userId: 'usr_1' } });
  });

  it('keeps the data until the grace period ends', async () => {
    const { service, tx } = build();

    await service.requestDeletion('usr_1');

    expect(tx.member.updateMany).not.toHaveBeenCalled();
    expect(tx.user.delete).not.toHaveBeenCalled();
  });
});

describe('The purge', () => {
  const expiredUser = { id: 'usr_1', members: [{ id: 'mem_1', familyId: 'fam_1' }] };

  it('does nothing while nobody is past the grace period', async () => {
    const { service, prisma } = build();

    expect(await service.purgeExpired()).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('strips the person from the member row instead of deleting it', async () => {
    const { service, prisma, tx } = build();
    prisma.user.findMany.mockResolvedValue([expiredUser]);

    await service.purgeExpired();

    expect(tx.member.updateMany).toHaveBeenCalledWith({
      where: { userId: 'usr_1' },
      data: {
        displayName: ANONYMISED_NAME,
        avatarUrl: null,
        avatarKey: null,
        birthDate: null,
        interests: [],
        status: 'removed',
      },
    });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'usr_1' } });
  });

  it('removes the photograph itself, not only the pointer to it', async () => {
    const { service, prisma, storage } = build();
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'usr_1',
        members: [{ id: 'mem_1', familyId: 'fam_1', avatarKey: 'families/fam_1/avatars/mem_1ab12.webp' }],
      },
    ]);

    await service.purgeExpired();
    expect(storage.remove).toHaveBeenCalledWith('families/fam_1/avatars/mem_1ab12.webp');
  });

  it('takes when they last looked, and their calendar address, with the person', async () => {
    const { service, prisma, tx } = build();
    prisma.user.findMany.mockResolvedValue([expiredUser]);

    await service.purgeExpired();

    expect(tx.memberVisit.deleteMany).toHaveBeenCalledWith({
      where: { member: { userId: 'usr_1' } },
    });
    expect(tx.calendarFeed.deleteMany).toHaveBeenCalledWith({
      where: { member: { userId: 'usr_1' } },
    });
  });

  it('takes the blocks they made, and leaves the blocks others made of them', async () => {
    const { service, prisma, tx } = build();
    prisma.user.findMany.mockResolvedValue([expiredUser]);

    await service.purgeExpired();

    expect(tx.memberBlock.deleteMany).toHaveBeenCalledWith({
      where: { blocker: { userId: 'usr_1' } },
    });
  });

  it('closes a family nobody can sign in to any more', async () => {
    const { service, prisma } = build();
    prisma.user.findMany.mockResolvedValue([expiredUser]);
    prisma.member.count.mockResolvedValue(0);

    await service.purgeExpired();

    expect(prisma.family.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'fam_1', deletedAt: null } }),
    );
  });

  it('leaves a family that still has somebody in it', async () => {
    const { service, prisma } = build();
    prisma.user.findMany.mockResolvedValue([expiredUser]);
    prisma.member.count.mockResolvedValue(1);

    await service.purgeExpired();

    expect(prisma.family.updateMany).not.toHaveBeenCalled();
  });

  it('writes down what it erased', async () => {
    const { service, prisma, audit } = build();
    prisma.user.findMany.mockResolvedValue([expiredUser]);
    prisma.member.count.mockResolvedValue(1);

    await service.purgeExpired();

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'account.purged', entityId: 'usr_1' }),
    );
  });
});
