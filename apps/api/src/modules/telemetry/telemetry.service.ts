import { Injectable } from '@nestjs/common';
import { MemberStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';
import { allowedProps } from './known-events';
import { scrubError, type ClientErrorInput } from './scrub';

/** One request carries at most this many; a flood beyond it is dropped. */
export const MAX_BATCH = 50;
/** Product events are kept long enough for a year's comparison and a month. */
export const EVENTS_KEPT_DAYS = 400;
/** Errors are kept long enough to see whether a fix held. */
export const ERRORS_KEPT_DAYS = 90;

/** How far back an event's own time is believed: a phone offline for a day. */
const BACKDATE_LIMIT_MS = 24 * 60 * 60 * 1000;
const FUTURE_SLACK_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface IncomingEvent {
  name?: unknown;
  props?: unknown;
  /** When it happened on the device, ISO. The batch is sent later. */
  at?: unknown;
}

/**
 * PRODUCT ANALYTICS AND ERROR REPORTS, first-party.
 *
 * The KPIs in docs/00-PLAN.md section 6 are what the month-12 decision is made
 * on, and until this module the events that measure them went to the console.
 *
 * What is stored is chosen by what is NOT: no user id, no member id, no device,
 * no address, no content (known-events.ts, scrub.ts). The finest grain is the
 * family, because "families with three events" is the finest question the
 * KPIs ask. A person who has said no (User.shareUsageStats) sends nothing that
 * is kept, whatever the app does - the switch is honoured here, not trusted to
 * every client.
 */
@Injectable()
export class TelemetryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Keep what may be kept of one batch; answers how many rows were written. */
  async record(
    userId: string,
    familyId: string | undefined,
    events: unknown,
    now: Date = new Date(),
  ): Promise<number> {
    if (!Array.isArray(events) || events.length === 0) return 0;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { shareUsageStats: true, deletedAt: true },
    });
    if (!user || user.deletedAt || !user.shareUsageStats) return 0;

    // A family id the sender is not in is not believed - kept without one.
    const family =
      typeof familyId === 'string' && familyId
        ? await this.prisma.member.findFirst({
            where: { userId, familyId, status: MemberStatus.active },
            select: { familyId: true },
          })
        : null;

    const rows: Prisma.AnalyticsEventCreateManyInput[] = [];
    for (const raw of events.slice(0, MAX_BATCH) as IncomingEvent[]) {
      if (!raw || typeof raw.name !== 'string') continue;
      const props = allowedProps(raw.name, raw.props);
      if (props === null) continue;

      rows.push({
        name: raw.name,
        props: Object.keys(props).length > 0 ? props : Prisma.JsonNull,
        familyId: family?.familyId ?? null,
        createdAt: whenItHappened(raw.at, now),
      });
    }

    if (rows.length === 0) return 0;
    const { count } = await this.prisma.analyticsEvent.createMany({ data: rows });
    return count;
  }

  /** One error report, scrubbed. False when there was nothing worth keeping. */
  async recordError(input: ClientErrorInput): Promise<boolean> {
    const clean = scrubError(input);
    if (!clean) return false;
    await this.prisma.clientError.create({ data: clean });
    return true;
  }

  /** The retention limits, applied. Derived from state, so a missed run loses nothing. */
  async sweep(now: Date = new Date()): Promise<{ events: number; errors: number }> {
    const events = await this.prisma.analyticsEvent.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - EVENTS_KEPT_DAYS * DAY_MS) } },
    });
    const errors = await this.prisma.clientError.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - ERRORS_KEPT_DAYS * DAY_MS) } },
    });
    return { events: events.count, errors: errors.count };
  }
}

/**
 * The device's own time for the event, when it is believable: not in the
 * future, not more than a day old. Otherwise the time it arrived. Retention is
 * counted in days, so a batch flushed on the next launch must not move a visit
 * into the wrong one.
 */
export function whenItHappened(at: unknown, now: Date): Date {
  if (typeof at !== 'string') return now;
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return now;
  if (ms > now.getTime() + FUTURE_SLACK_MS || ms < now.getTime() - BACKDATE_LIMIT_MS) return now;
  return new Date(ms);
}
