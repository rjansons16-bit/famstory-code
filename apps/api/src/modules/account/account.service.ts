import { Injectable, Logger } from '@nestjs/common';

import { AuditService } from '../../common/audit.service';
import {
  ANONYMISED_NAME,
  DELETION_GRACE_DAYS,
  purgeCutoff,
  purgeDueAt,
} from '../../common/deletion';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../../common/storage/storage.service';

/**
 * THE TWO RIGHTS A PERSON HAS OVER THEIR OWN ACCOUNT.
 *
 * Both were promised on the Settings screen and neither existed: "Export data"
 * and "Delete account" each opened a dialog saying the feature was coming.
 * Under GDPR they are not features - access (Art. 15), portability (Art. 20)
 * and erasure (Art. 17) are obligations, and this product holds children's
 * data, which is the category a regulator looks at first.
 *
 * The export is free for everybody. Premium sells the DESIGNED chronicle - a
 * PDF, a photo book - and that is a product. A machine-readable copy of your
 * own data is not something to sell back to its owner.
 */

/** The format string travels with the file, so a later reader knows the shape. */
export const EXPORT_FORMAT = 'famstory.export.v1';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Everything this account is, as JSON.
   *
   * SCOPE. A person's own data, not the family's archive: the events they
   * wrote, the comments they wrote, the reactions they left, the profile rows
   * that are them. Other people appear only where they are part of the user's
   * own record - the display names on an event they were in - and never with
   * an address or a birthday, which are theirs to export, not this user's.
   *
   * Photographs are listed, not embedded: the file would be hundreds of
   * megabytes of base64, and the storage keys are what a later ZIP walks.
   */
  async exportFor(
    userId: string,
    ctx: { ip?: string; userAgent?: string } = {},
  ): Promise<ExportFile> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        locale: true,
        // The choices this person made are part of what is kept about them.
        shareUsageStats: true,
        notifyEvents: true,
        notifyComments: true,
        notifyReminders: true,
        defaultReminderMinutes: true,
        // Which terms they accepted, and when: theirs to see too.
        termsVersion: true,
        termsAcceptedAt: true,
        healthConsentAt: true,
        createdAt: true,
        emailVerifiedAt: true,
        deletedAt: true,
      },
    });

    const members = await this.prisma.member.findMany({
      where: { userId },
      select: {
        id: true,
        familyId: true,
        displayName: true,
        avatarUrl: true,
        birthDate: true,
        interests: true,
        role: true,
        status: true,
        joinedAt: true,
        family: { select: { id: true, name: true, createdAt: true } },
        visit: { select: { lastSeenAt: true } },
      },
    });

    const memberIds = members.map((m) => m.id);

    const events = await this.prisma.event.findMany({
      where: { authorMemberId: { in: memberIds } },
      orderBy: { startsAt: 'asc' },
      select: {
        id: true,
        familyId: true,
        title: true,
        description: true,
        startsAt: true,
        endsAt: true,
        allDay: true,
        categoryId: true,
        tags: true,
        isMilestone: true,
        visibilityKind: true,
        // What kind of keepsake it is, as its author made it.
        promptKey: true,
        sealedUntil: true,
        revealAt: true,
        onStoryShelf: true,
        hiddenFrom: { select: { displayName: true } },
        createdAt: true,
        deletedAt: true,
        participants: { select: { member: { select: { displayName: true } } } },
        attachments: {
          select: { id: true, kind: true, mimeType: true, sizeBytes: true, storageKey: true },
        },
      },
    });

    const comments = await this.prisma.comment.findMany({
      where: { authorMemberId: { in: memberIds } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, eventId: true, body: true, createdAt: true, deletedAt: true },
    });

    const reactions = await this.prisma.reaction.findMany({
      where: { memberId: { in: memberIds } },
      select: { eventId: true, kind: true, createdAt: true },
    });

    const invitations = await this.prisma.invitation.findMany({
      where: { invitedByMemberId: { in: memberIds } },
      select: {
        id: true,
        familyId: true,
        email: true,
        role: true,
        createdAt: true,
        acceptedAt: true,
        revokedAt: true,
      },
    });

    // Whom this person blocked is a choice kept about them, so it is theirs to
    // take. The other person appears by name only, as on an event they were in.
    const blocks = await this.prisma.memberBlock.findMany({
      where: { blockerMemberId: { in: memberIds } },
      orderBy: { createdAt: 'asc' },
      select: { familyId: true, createdAt: true, blocked: { select: { displayName: true } } },
    });

    // A copy of personal data leaving the system is exactly the event the
    // audit log exists to record. Counts only - never the content itself.
    await this.audit.record({
      userId,
      action: 'export.requested',
      entityType: 'user',
      entityId: userId,
      metadata: { events: events.length, comments: comments.length },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      format: EXPORT_FORMAT,
      exportedAt: new Date().toISOString(),
      you: user,
      families: members.map((member) => ({
        family: member.family,
        yourProfile: {
          id: member.id,
          displayName: member.displayName,
          avatarUrl: member.avatarUrl,
          birthDate: member.birthDate,
          interests: member.interests,
          role: member.role,
          status: member.status,
          joinedAt: member.joinedAt,
          // What "new since you last looked" is measured from. Personal, and
          // in here for exactly that reason.
          lastVisitAt: member.visit?.lastSeenAt ?? null,
        },
      })),
      events: events.map((event) => ({
        ...event,
        participants: event.participants.map((p) => p.member.displayName),
      })),
      comments,
      reactions,
      invitationsYouSent: invitations,
      peopleYouBlocked: blocks.map((block) => ({
        familyId: block.familyId,
        name: block.blocked.displayName,
        since: block.createdAt,
      })),
    };
  }

  /**
   * Start the deletion: every session ends now, the data goes in 30 days.
   *
   * Nothing is anonymised yet - that is what the grace period is for. Push
   * tokens are the exception and go immediately: a device that may not belong
   * to this person any more must stop receiving a family's notifications today.
   */
  async requestDeletion(
    userId: string,
    ctx: { ip?: string; userAgent?: string } = {},
  ): Promise<{ deletedAt: Date; purgeAt: Date }> {
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { deletedAt: now } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.device.deleteMany({ where: { userId } }),
    ]);

    await this.audit.record({
      userId,
      action: 'account.deleted',
      entityType: 'user',
      entityId: userId,
      metadata: { graceDays: DELETION_GRACE_DAYS },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return { deletedAt: now, purgeAt: purgeDueAt(now) };
  }

  /**
   * Erase the accounts whose grace period has run out.
   *
   * Runs on boot and once a day (account.purge.ts). It has to be safe to run
   * twice and safe to miss entirely, so it reads the state of the world each
   * time rather than working through a queue of instructions.
   */
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const expired = await this.prisma.user.findMany({
      where: { deletedAt: { lte: purgeCutoff(now) } },
      select: { id: true, members: { select: { id: true, familyId: true, avatarKey: true } } },
    });

    for (const user of expired) {
      // Their face goes too - the file, not only the pointer to it.
      for (const member of user.members) {
        if (member.avatarKey) await this.storage.remove(member.avatarKey).catch(() => undefined);
      }

      await this.prisma.$transaction(async (tx) => {
        // When they last looked, and the calendar address they read from:
        // about the person, not the family, so they go rather than stay.
        await tx.memberVisit.deleteMany({ where: { member: { userId: user.id } } });
        await tx.calendarFeed.deleteMany({ where: { member: { userId: user.id } } });
        // The blocks they made are their choices and go with them. Blocks
        // others made of them stay: those are the others' choices, and what
        // the former member wrote stays in the family.
        await tx.memberBlock.deleteMany({ where: { blocker: { userId: user.id } } });

        // The member rows stay, stripped of the person. Deleting them would
        // take the family's own events and comments with them - deletion.ts.
        await tx.member.updateMany({
          where: { userId: user.id },
          data: {
            displayName: ANONYMISED_NAME,
            avatarUrl: null,
            avatarKey: null,
            birthDate: null,
            // What they liked is about the person too.
            interests: [],
            status: 'removed',
          },
        });

        // Identities, refresh tokens and devices go with it (schema cascade).
        // Audit entries keep their row and lose the name (SetNull), which is
        // what a record of processing is supposed to do.
        await tx.user.delete({ where: { id: user.id } });
      });

      await this.closeEmptyFamilies(
        user.members.map((m) => m.familyId),
        now,
      );

      await this.audit.record({
        action: 'account.purged',
        entityType: 'user',
        entityId: user.id,
        metadata: { families: user.members.length },
      });
    }

    if (expired.length > 0) {
      this.logger.log(`Erased ${expired.length} account(s) past the grace period.`);
    }

    return expired.length;
  }

  /**
   * A family nobody can sign in to any more is closed.
   *
   * Closed, not shredded: the chronicle and the child profiles stay on disk
   * behind a `deletedAt`. "The last adult deleted their account" and "these
   * memories should be destroyed" are different statements, and only one of
   * them can be taken back.
   */
  private async closeEmptyFamilies(familyIds: string[], now: Date): Promise<void> {
    for (const familyId of new Set(familyIds)) {
      const reachable = await this.prisma.member.count({
        where: { familyId, userId: { not: null }, status: 'active' },
      });
      if (reachable > 0) continue;

      await this.prisma.family.updateMany({
        where: { id: familyId, deletedAt: null },
        data: { deletedAt: now },
      });

      await this.audit.record({
        familyId,
        action: 'family.deleted',
        entityType: 'family',
        entityId: familyId,
        metadata: { reason: 'no_account_left' },
      });
    }
  }
}

export interface ExportFile {
  format: string;
  exportedAt: string;
  you: Record<string, unknown>;
  families: unknown[];
  events: unknown[];
  comments: unknown[];
  reactions: unknown[];
  invitationsYouSent: unknown[];
  peopleYouBlocked: unknown[];
}
