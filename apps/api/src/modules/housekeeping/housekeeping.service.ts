import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../../common/storage/storage.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long the rows nobody looks at are kept (docs/legal/record-of-processing.md).
 *
 * Each of these is data that stopped doing anything: a session that expired,
 * an invitation nobody took up, a reset link that was used or ran out, a
 * suggestion long past its week. Kept forever they are only something to lose.
 * The margins are there so that nothing still in use - or still useful for
 * working out what happened after an incident - goes the moment it expires.
 *
 * Three are promises the privacy policy makes (docs/legal/privacy-policy.md,
 * "How long we keep it"), chosen for the launch on 2026-10-08 and listed in
 * docs/legal/README.md for the lawyer: a report, the audit log, and a family
 * nobody can sign in to any more. Change one here and there together.
 */
export const KEEP = {
  /** After it expired or was revoked. It could not be used by then anyway. */
  sessionDays: 7,
  /** An invitation never accepted, after it expired or was withdrawn. Accepted ones stay - they are who invited whom. */
  invitationDays: 90,
  /** A reset link after it expired, used or not. */
  passwordResetDays: 30,
  /** A suggestion, from when it was made - the same year and a month as the usage counts. */
  suggestionDays: 400,
  /** A report of an entry or a comment, from when it was made, dealt with or not. */
  reportDays: 365,
  /** The audit log: who changed who sees what, who opened a child's profile. */
  auditDays: 730,
  /**
   * A closed family - nobody left who can sign in (AccountService) - from when
   * it was closed. Until then it can be restored if somebody asks; after,
   * it goes for good, with its photographs.
   */
  closedFamilyDays: 365,
  /**
   * A phone's push token not seen for half a year: the app registers it at
   * every launch, so this is a phone that has not opened FamStory since.
   */
  deviceDays: 180,
} as const;

export interface Swept {
  sessions: number;
  invitations: number;
  passwordResets: number;
  suggestions: number;
  reports: number;
  auditEntries: number;
  families: number;
  devices: number;
}

@Injectable()
export class HousekeepingService {
  private readonly logger = new Logger(HousekeepingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async sweep(now: Date = new Date()): Promise<Swept> {
    const before = (days: number) => new Date(now.getTime() - days * DAY_MS);

    const sessions = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: before(KEEP.sessionDays) } },
          { revokedAt: { lt: before(KEEP.sessionDays) } },
        ],
      },
    });

    const invitations = await this.prisma.invitation.deleteMany({
      where: {
        acceptedAt: null,
        OR: [
          { expiresAt: { lt: before(KEEP.invitationDays) } },
          { revokedAt: { lt: before(KEEP.invitationDays) } },
        ],
      },
    });

    const passwordResets = await this.prisma.passwordReset.deleteMany({
      where: { expiresAt: { lt: before(KEEP.passwordResetDays) } },
    });

    const suggestions = await this.prisma.insight.deleteMany({
      where: { createdAt: { lt: before(KEEP.suggestionDays) } },
    });

    const reports = await this.prisma.contentReport.deleteMany({
      where: { createdAt: { lt: before(KEEP.reportDays) } },
    });

    const auditEntries = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: before(KEEP.auditDays) } },
    });

    const families = await this.purgeClosedFamilies(before(KEEP.closedFamilyDays));

    const devices = await this.prisma.device.deleteMany({
      where: { lastSeenAt: { lt: before(KEEP.deviceDays) } },
    });

    return {
      sessions: sessions.count,
      invitations: invitations.count,
      passwordResets: passwordResets.count,
      suggestions: suggestions.count,
      reports: reports.count,
      auditEntries: auditEntries.count,
      families,
      devices: devices.count,
    };
  }

  /**
   * Closed long enough ago, and still nobody in it who can sign in: the
   * files first, then the family and everything that hangs from it (the
   * schema cascades). A family somebody was let back into is not closed any
   * more - restoring clears `deletedAt` - and a member with an account is
   * checked again here, so neither can be taken.
   */
  private async purgeClosedFamilies(closedBefore: Date): Promise<number> {
    const due = await this.prisma.family.findMany({
      where: {
        deletedAt: { lt: closedBefore },
        members: { none: { userId: { not: null }, status: 'active' } },
      },
      select: { id: true },
      take: 50,
    });

    for (const family of due) {
      await this.storage.removeFamily(family.id);
      await this.prisma.family.delete({ where: { id: family.id } });
      await this.audit.record({
        action: 'family.purged',
        entityType: 'family',
        entityId: family.id,
        metadata: { reason: 'closed', keptDays: KEEP.closedFamilyDays },
      });
    }
    if (due.length > 0) this.logger.log(`Deleted ${due.length} family(ies) closed for over a year.`);
    return due.length;
  }
}

/** Once at boot and once a day, like AccountPurge and TelemetrySweeper. */
@Injectable()
export class HousekeepingSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HousekeepingSweeper.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly housekeeping: HousekeepingService) {}

  onModuleInit(): void {
    void this.run();
    this.timer = setInterval(() => void this.run(), DAY_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async run(): Promise<void> {
    try {
      await this.housekeeping.sweep();
    } catch (error) {
      this.logger.error('Housekeeping failed', error as Error);
    }
  }
}
