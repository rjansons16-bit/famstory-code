import { createHash, randomBytes } from 'node:crypto';

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberRole } from '@prisma/client';

import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';

/** How long a link may live. A week unless asked otherwise; never open-ended. */
export const GUEST_LINK_DAYS = [1, 7, 30] as const;
const DEFAULT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * An heirloom sticker outlives the phone it was made on: a century. Still
 * revocable, and still gone the day whoever made it leaves the family.
 */
const HEIRLOOM_DAYS = 100 * 366;

export interface GuestView {
  familyName: string;
  /** The first name of whoever shared it - "Anna shared this with you". */
  sharedBy: string;
  expiresAt: string;
  /** A sticker on a family heirloom: the voice comes with it (see the schema). */
  heirloom: boolean;
  event: {
    title: string;
    description: string | null;
    startsAt: string;
    endsAt: string | null;
    allDay: boolean;
    categoryId: string;
    photos: { url: string; thumbnailUrl: string; width: number | null; height: number | null }[];
    /** Only on an heirloom sticker; an ordinary guest link never carries a voice. */
    voiceNotes: { url: string; durationSec: number | null }[];
  };
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * GUEST LINKS - one event, for somebody who is not in the family.
 *
 * The grandmother who will never install anything, the godparent abroad: they
 * still see the birthday. It is the one deliberate way anything leaves the
 * family (docs/08-LAUNCH-PLAN.md 3.8), so it is narrow on every axis:
 *
 *   - one event, read-only, no account;
 *   - made only by whoever wrote the event, or an admin - somebody who can
 *     merely see it cannot hand it on;
 *   - expiring (a day, a week, a month) and revocable, with the view count
 *     shown to whoever made it;
 *   - only the words, the date and the photographs: never who was there,
 *     never who else can see it, never the comments - and the voice only on
 *     an heirloom sticker, made for that and said so when it is made;
 *   - never a closed time capsule, nor a surprise before its day: a link is a
 *     way out of the family, and neither may leave it early;
 *   - only the hash kept, like refresh tokens;
 *   - every link made, and every view of an event with a child in it, in the
 *     audit log - a child's photograph leaving the family is exactly the
 *     event a regulator asks about.
 */
@Injectable()
export class GuestLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async create(
    ctx: ViewerContext,
    eventId: string,
    days: unknown,
    origin: string,
    heirloom = false,
  ) {
    await this.visibility.assertCanOpenEvent(ctx, eventId);

    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: {
        authorMemberId: true,
        sealedUntil: true,
        hiddenFromMemberId: true,
        revealAt: true,
        participants: { select: { member: { select: { role: true } } } },
      },
    });
    if (event.authorMemberId !== ctx.memberId && ctx.role !== MemberRole.admin) {
      throw new ForbiddenException({
        code: 'insufficient_role',
        message: 'Only whoever added the event, or an admin, can share it outside the family.',
      });
    }
    // Even its author cannot hand a sealed capsule out: the guest would be
    // reading it before the family may.
    if (event.sealedUntil && event.sealedUntil.getTime() > Date.now()) {
      throw new ForbiddenException({ code: 'capsule_sealed', message: 'This time capsule is not open yet.' });
    }
    if (event.hiddenFromMemberId && (!event.revealAt || event.revealAt.getTime() > Date.now())) {
      throw new ForbiddenException({
        code: 'surprise_not_ready',
        message: 'A surprise can be shared once its day has come.',
      });
    }

    const lifetime = heirloom
      ? HEIRLOOM_DAYS
      : GUEST_LINK_DAYS.includes(days as (typeof GUEST_LINK_DAYS)[number])
        ? (days as number)
        : DEFAULT_DAYS;
    const token = randomBytes(24).toString('base64url');
    const link = await this.prisma.eventShareLink.create({
      data: {
        eventId,
        familyId: ctx.familyId,
        tokenHash: hash(token),
        createdByMemberId: ctx.memberId,
        expiresAt: new Date(Date.now() + lifetime * DAY_MS),
        heirloom,
      },
    });

    await this.audit.record({
      familyId: ctx.familyId,
      action: 'guest_link.created',
      entityType: 'Event',
      entityId: eventId,
      metadata: {
        days: lifetime,
        heirloom,
        childInvolved: event.participants.some((p) => p.member.role === MemberRole.child),
      },
    });

    return {
      id: link.id,
      url: `${origin}/guest/${token}`,
      expiresAt: link.expiresAt.toISOString(),
      heirloom,
    };
  }

  /** The links still open on an event, for whoever may manage them. */
  async listFor(ctx: ViewerContext, eventId: string) {
    await this.visibility.assertCanOpenEvent(ctx, eventId);
    const rows = await this.prisma.eventShareLink.findMany({
      where: { eventId, familyId: ctx.familyId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        expiresAt: true,
        heirloom: true,
        viewCount: true,
        lastViewedAt: true,
        createdByMemberId: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      expiresAt: row.expiresAt.toISOString(),
      lastViewedAt: row.lastViewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async revoke(ctx: ViewerContext, linkId: string): Promise<void> {
    const row = await this.prisma.eventShareLink.findFirst({
      where: { id: linkId, familyId: ctx.familyId },
      select: { id: true, eventId: true, createdByMemberId: true, revokedAt: true },
    });
    if (!row) throw new NotFoundException({ code: 'not_found', message: 'Not found.' });
    if (row.createdByMemberId !== ctx.memberId && ctx.role !== MemberRole.admin) {
      throw new ForbiddenException({ code: 'insufficient_role', message: 'Only whoever made it.' });
    }
    if (row.revokedAt) return;

    await this.prisma.eventShareLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
    await this.audit.record({
      familyId: ctx.familyId,
      action: 'guest_link.revoked',
      entityType: 'Event',
      entityId: row.eventId,
      metadata: { linkId },
    });
  }

  /** What a guest sees, or null for a link that is wrong, withdrawn, expired or orphaned. */
  async open(token: string, origin: string, now: Date = new Date()): Promise<GuestView | null> {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;

    const link = await this.prisma.eventShareLink.findUnique({
      where: { tokenHash: hash(token) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        heirloom: true,
        createdBy: { select: { displayName: true, status: true } },
        family: { select: { name: true, deletedAt: true } },
        event: {
          select: {
            id: true,
            familyId: true,
            title: true,
            description: true,
            startsAt: true,
            endsAt: true,
            allDay: true,
            categoryId: true,
            deletedAt: true,
            sealedUntil: true,
            hiddenFromMemberId: true,
            revealAt: true,
            participants: { select: { member: { select: { role: true } } } },
            attachments: {
              where: { uploadedAt: { not: null }, kind: { in: ['image', 'audio'] } },
              orderBy: { createdAt: 'asc' },
              select: {
                kind: true,
                storageKey: true,
                thumbnailKey: true,
                width: true,
                height: true,
                durationSec: true,
              },
            },
          },
        },
      },
    });

    const usable =
      link &&
      !link.revokedAt &&
      link.expiresAt.getTime() > now.getTime() &&
      !link.event.deletedAt &&
      !link.family.deletedAt &&
      // Sealed again since it was shared, or a surprise not yet shown: closed
      // to the guest exactly as it is to the family.
      !(link.event.sealedUntil && link.event.sealedUntil.getTime() > now.getTime()) &&
      !(link.event.hiddenFromMemberId && !(link.event.revealAt && link.event.revealAt.getTime() <= now.getTime())) &&
      // Whoever shared it is still in the family: somebody removed does not
      // keep a window into it.
      link.createdBy.status === 'active';
    if (!usable) return null;

    await this.prisma.eventShareLink.update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: now },
    });

    if (link.event.participants.some((p) => p.member.role === MemberRole.child)) {
      await this.audit.record({
        familyId: link.event.familyId,
        action: 'guest_link.viewed',
        entityType: 'Event',
        entityId: link.event.id,
        metadata: { linkId: link.id },
      });
    }

    const photos = link.event.attachments.filter((a) => a.kind === 'image');
    const heirloom = link.heirloom === true;
    const voices = heirloom ? link.event.attachments.filter((a) => a.kind === 'audio') : [];

    return {
      familyName: link.family.name,
      sharedBy: link.createdBy.displayName.split(' ')[0],
      expiresAt: link.expiresAt.toISOString(),
      heirloom,
      event: {
        title: link.event.title,
        description: link.event.description,
        startsAt: link.event.startsAt.toISOString(),
        endsAt: link.event.endsAt?.toISOString() ?? null,
        allDay: link.event.allDay,
        categoryId: link.event.categoryId,
        photos: photos.map((a) => ({
          url: this.storage.signedUrl(a.storageKey, origin).url,
          thumbnailUrl: this.storage.signedUrl(a.thumbnailKey ?? a.storageKey, origin).url,
          width: a.width,
          height: a.height,
        })),
        voiceNotes: voices.map((a) => ({
          url: this.storage.signedUrl(a.storageKey, origin).url,
          durationSec: a.durationSec,
        })),
      },
    };
  }
}
