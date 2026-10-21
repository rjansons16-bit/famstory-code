import { Injectable } from '@nestjs/common';

import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import { SigningService } from '../../common/signing.service';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';
import { buildCalendar, type IcsBirthday } from './ics';

/** How far back and ahead one-off events are sent. Series are always sent. */
const PAST_DAYS = 400;
const FUTURE_DAYS = 3 * 365;
/** A feed with thousands of entries is a phone calendar nobody can read. */
const MAX_EVENTS = 2000;
/** Writing "last fetched" on every poll would be a write per calendar per hour. */
const FETCH_NOTE_EVERY_MS = 10 * 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** member id . version . signature .ics - ids are cuids, letters and digits (and _ in tests). */
const FILE = /^([a-z0-9_]+)\.(\d+)\.([a-f0-9]{64})\.ics$/;

export interface FeedView {
  /** For the calendar app: an https:// (or http://) address ending in .ics. */
  url: string;
  /** The same address as webcal://, which a phone opens straight in its calendar. */
  webcalUrl: string;
  createdAt: string;
  lastFetchedAt: string | null;
}

/**
 * THE FAMILY'S EVENTS IN THE PHONE'S OWN CALENDAR.
 *
 * Nine tenths of a "Google Calendar integration" is a read-only address: the
 * calendar app polls it and shows the entries wherever the person already
 * looks for their week. No OAuth, no sync, no write path.
 *
 * The address IS the permission - whoever has it reads the feed - so:
 *   - it is signed, not stored, and names one member and a version;
 *   - it answers with exactly what that member could see in the app, through
 *     the same eventFilter as the timeline, computed on every fetch - a
 *     narrowed event leaves the feed the next time the calendar polls;
 *   - resetting bumps the version, and every copy of the old address dies;
 *   - a member who has left, died or deleted their account reads nothing.
 */
@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
    private readonly signing: SigningService,
    private readonly audit: AuditService,
  ) {}

  async feedFor(ctx: ViewerContext, origin: string): Promise<FeedView> {
    let feed = await this.prisma.calendarFeed.findUnique({ where: { memberId: ctx.memberId } });
    if (!feed) {
      feed = await this.prisma.calendarFeed.create({ data: { memberId: ctx.memberId } });
      await this.audit.record({
        familyId: ctx.familyId,
        action: 'calendar_feed.created',
        entityType: 'Member',
        entityId: ctx.memberId,
      });
    }
    return this.view(origin, ctx.memberId, feed);
  }

  /** A new address; the old one stops working the next time a calendar asks. */
  async reset(ctx: ViewerContext, origin: string): Promise<FeedView> {
    const feed = await this.prisma.calendarFeed.upsert({
      where: { memberId: ctx.memberId },
      create: { memberId: ctx.memberId, version: 2 },
      update: { version: { increment: 1 }, lastFetchedAt: null },
    });
    await this.audit.record({
      familyId: ctx.familyId,
      action: 'calendar_feed.reset',
      entityType: 'Member',
      entityId: ctx.memberId,
      metadata: { version: feed.version },
    });
    return this.view(origin, ctx.memberId, feed);
  }

  /** The feed's text, or null for an address that is wrong, old or no longer anybody's. */
  async render(file: string, now: Date = new Date()): Promise<string | null> {
    const match = FILE.exec(file);
    if (!match) return null;
    const [, memberId, versionText, signature] = match;
    if (!this.signing.verify('calendar', `${memberId}.${versionText}`, signature)) return null;

    const feed = await this.prisma.calendarFeed.findUnique({
      where: { memberId },
      select: {
        version: true,
        lastFetchedAt: true,
        member: {
          select: {
            id: true,
            familyId: true,
            role: true,
            status: true,
            diedOn: true,
            userId: true,
            groupLinks: { select: { groupId: true } },
            family: { select: { name: true, deletedAt: true } },
            user: { select: { deletedAt: true, locale: true } },
          },
        },
      },
    });
    if (!feed || feed.version !== Number(versionText)) return null;

    const member = feed.member;
    const reachable =
      member.status === 'active' &&
      !member.diedOn &&
      member.userId !== null &&
      !member.family.deletedAt &&
      !member.user?.deletedAt;
    if (!reachable) return null;

    const ctx: ViewerContext = {
      memberId: member.id,
      familyId: member.familyId,
      role: member.role,
      groupIds: member.groupLinks.map((g) => g.groupId),
    };

    const events = await this.prisma.event.findMany({
      where: {
        AND: [
          this.visibility.eventFilter(ctx, now),
          {
            OR: [
              { repeat: { not: null } },
              {
                startsAt: {
                  gte: new Date(now.getTime() - PAST_DAYS * DAY_MS),
                  lte: new Date(now.getTime() + FUTURE_DAYS * DAY_MS),
                },
              },
            ],
          },
        ],
      },
      orderBy: { startsAt: 'asc' },
      take: MAX_EVENTS,
      select: {
        id: true,
        title: true,
        description: true,
        startsAt: true,
        endsAt: true,
        allDay: true,
        repeat: true,
        repeatUntil: true,
        repeatSkips: true,
        repeatTimeZone: true,
        updatedAt: true,
        sealedUntil: true,
        authorMemberId: true,
      },
    });
    // A closed time capsule is in the calendar as its envelope: when, and the
    // title, never the words inside it.
    const listed = events.map((event) =>
      this.visibility.isSealedFor(ctx, event, now) ? { ...event, description: null } : event,
    );

    // Birthdays, as the app shows them: everybody present with a date, and
    // nobody the family has marked as having died.
    const people = await this.prisma.member.findMany({
      where: {
        familyId: member.familyId,
        status: 'active',
        diedOn: null,
        birthDate: { not: null },
      },
      select: { id: true, displayName: true, birthDate: true },
    });
    const label = member.user?.locale === 'en' ? 'Birthday' : 'Dzimšanas diena';
    const birthdays: IcsBirthday[] = people.map((p) => ({
      memberId: p.id,
      summary: `${label}: ${p.displayName}`,
      birthDate: p.birthDate as Date,
    }));

    if (!feed.lastFetchedAt || now.getTime() - feed.lastFetchedAt.getTime() > FETCH_NOTE_EVERY_MS) {
      await this.prisma.calendarFeed.update({ where: { memberId }, data: { lastFetchedAt: now } });
    }

    return buildCalendar({ name: member.family.name, events: listed, birthdays, now });
  }

  private view(
    origin: string,
    memberId: string,
    feed: { version: number; createdAt: Date; lastFetchedAt: Date | null },
  ): FeedView {
    const payload = `${memberId}.${feed.version}`;
    const url = `${origin}/v1/calendar/${payload}.${this.signing.sign('calendar', payload)}.ics`;
    return {
      url,
      webcalUrl: url.replace(/^https?:\/\//, 'webcal://'),
      createdAt: feed.createdAt.toISOString(),
      lastFetchedAt: feed.lastFetchedAt?.toISOString() ?? null,
    };
  }
}
