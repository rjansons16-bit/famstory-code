import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { PrismaService } from './prisma.service';

/**
 * THE AUDIT LOG.
 *
 * The study's technological risk "data security incident" — critical impact.
 * Its mitigation names an audit log explicitly.
 *
 * Must be recorded:
 *   - any access to, or change of, a child profile
 *   - a change of an event's visibility
 *   - the deletion or restoration of an event: "who removed our wedding?" is
 *     the question a family asks a year later, and nothing else answers it
 *   - a role change
 *   - the removal of a member
 *   - exports
 *   - deletion of an account or a family
 *
 * DATA MINIMISATION: metadata MUST NOT carry an event title, description,
 * comment text or photo references. The audit log is a security instrument, not
 * a second copy of the database. If it holds content, it becomes a leak risk in
 * its own right.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          familyId: entry.familyId ?? null,
          userId: entry.userId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadata: entry.metadata ?? undefined,
          ipHash: entry.ip ? hashIp(entry.ip) : null,
          userAgent: entry.userAgent?.slice(0, 255) ?? null,
        },
      });
    } catch (error) {
      // A failed audit write must not stop the user's action, but it must not
      // disappear silently either.
      this.logger.error(`Audit write failed: ${entry.action}`, error as Error);
    }
  }
}

/**
 * The IP is never stored in the clear — only a salted hash.
 * Enough to recognise repeated access from one place while investigating an
 * incident, but not personal data to be kept forever.
 */
function hashIp(ip: string): string {
  const salt = process.env.AUDIT_IP_SALT ?? '';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

export type AuditAction =
  | 'child_profile.viewed'
  | 'child_profile.updated'
  | 'event.visibility_changed'
  | 'event.deleted'
  | 'event.restored'
  | 'member.role_changed'
  | 'member.removed'
  | 'family.deleted'
  /** A closed family deleted for good, a year after it closed (housekeeping). */
  | 'family.purged'
  | 'account.deleted'
  /** Signed in during the 30-day grace period, so the account came back. */
  | 'account.restored'
  /** The grace period ran out: the personal data is gone for good. */
  | 'account.purged'
  /** An admin made a one-time link to set another adult's password. */
  | 'account.password_reset_link'
  /** The link was used: the password changed and every session ended. */
  | 'account.password_reset'
  /** Somebody asked for a link by email, and one was sent to the account's address. */
  | 'account.password_reset_email'
  | 'export.requested'
  | 'invitation.created'
  | 'invitation.accepted'
  /** A read-only calendar address was made, or replaced (the old one dies). */
  | 'calendar_feed.created'
  | 'calendar_feed.reset'
  /** In memoriam: marked by an admin, and taken back. */
  | 'member.marked_deceased'
  | 'member.unmarked_deceased'
  /** One event shared outside the family, the link withdrawn, and a guest's view of a child's event. */
  | 'guest_link.created'
  | 'guest_link.revoked'
  | 'guest_link.viewed'
  /** A photograph or a voice note taken out of an event. */
  | 'attachment.deleted';

export interface AuditEntry {
  familyId?: string;
  userId?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  /** Structural facts only. No content. */
  metadata?: Record<string, string | number | boolean | null>;
  ip?: string;
  userAgent?: string;
}
