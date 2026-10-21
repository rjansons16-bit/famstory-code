import type { AuditService } from '../../common/audit.service';
import type { PrismaService } from '../../common/prisma.service';
import type { StorageService } from '../../common/storage/storage.service';
import { HousekeepingService, KEEP } from './housekeeping.service';

/**
 * What goes, and - the half that matters more - what stays: an accepted
 * invitation, a session still running, a closed family somebody could still
 * ask for, or one with a member who can sign in.
 */

function build(closed: string[] = []) {
  const order: string[] = [];
  const prisma = {
    refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
    invitation: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    passwordReset: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    insight: { deleteMany: jest.fn().mockResolvedValue({ count: 4 }) },
    contentReport: { deleteMany: jest.fn().mockResolvedValue({ count: 5 }) },
    auditLog: { deleteMany: jest.fn().mockResolvedValue({ count: 6 }) },
    device: { deleteMany: jest.fn().mockResolvedValue({ count: 7 }) },
    family: {
      findMany: jest.fn().mockResolvedValue(closed.map((id) => ({ id }))),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        order.push(`row ${where.id}`);
        return { id: where.id };
      }),
    },
  };
  const storage = {
    removeFamily: jest.fn(async (id: string) => {
      order.push(`files ${id}`);
    }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new HousekeepingService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
    audit as unknown as AuditService,
  );
  return { service, prisma, storage, audit, order };
}

const NOW = new Date('2026-09-24T12:00:00.000Z');
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 864e5);
const where = (mock: jest.Mock) => mock.mock.calls[0][0].where;

describe('Housekeeping', () => {
  it('answers how many of each went', async () => {
    const { service } = build();
    expect(await service.sweep(NOW)).toEqual({
      sessions: 3,
      invitations: 2,
      passwordResets: 1,
      suggestions: 4,
      reports: 5,
      auditEntries: 6,
      families: 0,
      devices: 7,
    });
  });

  it('forgets a phone that has not opened the app for half a year', async () => {
    const { service, prisma } = build();
    await service.sweep(NOW);
    expect(where(prisma.device.deleteMany)).toEqual({ lastSeenAt: { lt: daysBefore(KEEP.deviceDays) } });
    expect(KEEP.deviceDays).toBe(180);
  });

  it('removes sessions a week after they ended, not while they run', async () => {
    const { service, prisma } = build();
    await service.sweep(NOW);

    expect(where(prisma.refreshToken.deleteMany)).toEqual({
      OR: [
        { expiresAt: { lt: daysBefore(KEEP.sessionDays) } },
        { revokedAt: { lt: daysBefore(KEEP.sessionDays) } },
      ],
    });
  });

  it('keeps every accepted invitation - that is who invited whom', async () => {
    const { service, prisma } = build();
    await service.sweep(NOW);

    const rule = where(prisma.invitation.deleteMany);
    expect(rule.acceptedAt).toBeNull();
    expect(rule.OR[0].expiresAt.lt).toEqual(daysBefore(KEEP.invitationDays));
  });

  it('removes reset links a month after they ran out', async () => {
    const { service, prisma } = build();
    await service.sweep(NOW);
    expect(where(prisma.passwordReset.deleteMany)).toEqual({ expiresAt: { lt: daysBefore(30) } });
  });

  it('keeps suggestions as long as the usage counts', async () => {
    const { service, prisma } = build();
    await service.sweep(NOW);
    expect(where(prisma.insight.deleteMany)).toEqual({ createdAt: { lt: daysBefore(400) } });
  });

  it('keeps a report 12 months and the audit log 24, as the privacy policy says', async () => {
    const { service, prisma } = build();
    await service.sweep(NOW);
    expect(where(prisma.contentReport.deleteMany)).toEqual({ createdAt: { lt: daysBefore(365) } });
    expect(where(prisma.auditLog.deleteMany)).toEqual({ createdAt: { lt: daysBefore(730) } });
  });

  it('asks only for families closed over a year ago with nobody left who can sign in', async () => {
    const { service, prisma } = build();
    await service.sweep(NOW);
    expect(where(prisma.family.findMany)).toEqual({
      deletedAt: { lt: daysBefore(KEEP.closedFamilyDays) },
      members: { none: { userId: { not: null }, status: 'active' } },
    });
    expect(prisma.family.delete).not.toHaveBeenCalled();
  });

  it('deletes such a family files first, then its rows, and says so in the audit log', async () => {
    const { service, order, audit } = build(['famold1', 'famold2']);
    expect((await service.sweep(NOW)).families).toBe(2);
    expect(order).toEqual(['files famold1', 'row famold1', 'files famold2', 'row famold2']);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'family.purged', entityId: 'famold1' }),
    );
  });
});
