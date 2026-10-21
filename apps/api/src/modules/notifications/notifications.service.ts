import { Injectable, Logger, Optional } from '@nestjs/common';
import { MemberRole, MemberStatus, NotificationKind, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';
import { nextReminderAt, wallTime } from '../../common/recurrence';
import { addDays, dayInstant, specialDayOn } from '../../common/special-days';
import { PushService } from '../push/push.service';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';

/**
 * THE BELL.
 *
 * Reminders were stored and nothing delivered them; the bell in the corner of
 * the timeline opened a list the server had never written a row into. For a
 * family app that is the difference between a place you visit and a place
 * that tells you when there is a reason to.
 *
 * FOUR KINDS, and each has one rule for who hears about it:
 *
 *   event_created   everybody who can see the new event, except its author
 *   comment_added   the people already in that conversation - the author and
 *                   whoever has commented - except the one who just did
 *   event_reminder  the reminder's targets, or its author when it has none
 *   member_joined   the family's admins, who are the ones who invited them
 *
 * The first three also answer to each person's own switch on the settings
 * screen (User.notify*): turned off, that kind is not written for them.
 *
 * And two that a date brings rather than a person:
 *
 *   capsule_opened  everybody who can see a time capsule, but its author,
 *                   the minute it opens
 *   surprise_ready  the one a surprise was for, once, on its morning - however
 *                   many of the family wrote them something
 *   special_day     everybody who can sign in and wants reminders, three days
 *                   before Mother's Day, Midsummer, Christmas Eve and the rest
 *                   (common/special-days.ts) - once a day each, whatever runs
 *
 * And one that a report brings:
 *
 *   content_reported  the family's admins who can see the entry, but not the
 *                     one who reported it or wrote it, with no actor
 *
 * THE RULE UNDER ALL FOUR: a notification must never be the place an event
 * leaks. Recipients are decided with the SAME visibility filter the timeline
 * uses, run per recipient - not a second, simpler version of it that could
 * drift - and the list is filtered again when it is read, because visibility
 * can narrow after a notification was written.
 *
 * And nobody is told what somebody they blocked did (docs/02-DATA-MODEL.md,
 * Blocks): `write()` drops them for every kind with an actor, and the list
 * leaves out, when read, what was written before the block.
 *
 * Only members who can sign in are ever notified. A child profile has no
 * account, so there is nobody to tell - and a row for them would be a list of
 * a child's family activity that nothing reads and something could leak.
 *
 * Writing a notification never fails the thing that caused it. Creating an
 * event, a comment or a membership is the family's action; the bell is a
 * consequence, and a consequence that throws would turn a saved memory into
 * an error on screen.
 *
 * And the phone: `write()` hands exactly the same people to PushService,
 * which knocks on the phones of those who allowed it - with a line that
 * holds nothing the family wrote (push/push-messages.ts).
 */

/** How many the bell shows. Older ones are still in the table, just not listed. */
const LIST_LIMIT = 50;

/**
 * The switch on the settings screen that each kind answers to (User.notify*).
 * Somebody who turned one off gets no row of that kind at all - not a row
 * hidden when read, which would still be a record of it. Joining has no
 * switch: it goes to the admins who sent the invitation.
 */
type Preference = 'notifyEvents' | 'notifyComments' | 'notifyReminders';

/**
 * A reminder that comes due this long after its event started is dropped
 * rather than delivered: the server was off, and "your dentist appointment is
 * in one hour" arriving at nine in the evening is worse than no reminder.
 */
const STALE_REMINDER_MS = 6 * 60 * 60 * 1000;

/**
 * Special days: which zone's calendar says what today is, how far ahead a day
 * is announced - time to buy flowers, or to call - and not before this hour
 * there, so nobody's phone lights up at midnight about Father's Day.
 */
const SPECIAL_DAY_ZONE = 'Europe/Riga';
const SPECIAL_DAY_LEAD_DAYS = 3;
const SPECIAL_DAY_HOUR = 9;

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  eventId: string | null;
  eventTitle: string | null;
  eventStartsAt: string | null;
  actorName: string | null;
  /** A special day: which, and its date (kind special_day only). */
  dayKey: string | null;
  dayOn: string | null;
  createdAt: string;
  readAt: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  /** The Riga date special days were last dealt with, so the day's other runs cost nothing. */
  private specialDaysDoneFor: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
    // The phones of the same people (push.service.ts); absent in tests that
    // only look at the rows.
    @Optional() private readonly push?: PushService,
  ) {}

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  async eventCreated(familyId: string, eventId: string, authorMemberId: string): Promise<void> {
    await this.safely('event_created', async () => {
      const recipients = await this.whoCanSee(familyId, eventId, {
        wants: 'notifyEvents',
        except: authorMemberId,
      });
      await this.write(familyId, recipients, {
        kind: NotificationKind.event_created,
        eventId,
        actorMemberId: authorMemberId,
      });
    });
  }

  async commentAdded(familyId: string, eventId: string, commenterMemberId: string): Promise<void> {
    await this.safely('comment_added', async () => {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        select: {
          authorMemberId: true,
          comments: { where: { deletedAt: null }, select: { authorMemberId: true } },
        },
      });
      if (!event) return;

      // The conversation, not the family: a grandparent who never opened this
      // event should not be told every time two parents discuss it.
      const involved = new Set([
        event.authorMemberId,
        ...event.comments.map((c) => c.authorMemberId),
      ]);
      involved.delete(commenterMemberId);

      const recipients = await this.whoCanSee(familyId, eventId, {
        wants: 'notifyComments',
        only: [...involved],
      });
      await this.write(familyId, recipients, {
        kind: NotificationKind.comment_added,
        eventId,
        actorMemberId: commenterMemberId,
      });
    });
  }

  async memberJoined(familyId: string, newMemberId: string): Promise<void> {
    await this.safely('member_joined', async () => {
      const admins = await this.prisma.member.findMany({
        where: {
          familyId,
          role: MemberRole.admin,
          status: MemberStatus.active,
          userId: { not: null },
          diedOn: null,
          id: { not: newMemberId },
        },
        select: { id: true },
      });

      await this.write(
        familyId,
        admins.map((a) => a.id),
        { kind: NotificationKind.member_joined, actorMemberId: newMemberId },
      );
    });
  }

  /**
   * Somebody reported an entry or a comment in it (reports.service.ts).
   *
   * The family's admins hear about it, but only those who can see the entry.
   * Not the one who reported it, and not the one who wrote what was
   * reported: a family is small, and the bell is not the place to start an
   * argument. The row carries no actor, because who reported it is not the
   * admins' to know. The operator sees every report regardless (npm run
   * reports). No switch on the settings screen turns this off; like a
   * member joining, it is the admins' job.
   */
  async contentReported(
    familyId: string,
    eventId: string,
    reporterMemberId: string,
    authorMemberId: string,
  ): Promise<void> {
    await this.safely('content_reported', async () => {
      const admins = await this.prisma.member.findMany({
        where: {
          familyId,
          role: MemberRole.admin,
          status: MemberStatus.active,
          userId: { not: null },
          diedOn: null,
          id: { notIn: [reporterMemberId, authorMemberId] },
        },
        select: { id: true },
      });

      const recipients = await this.whoCanSee(familyId, eventId, { only: admins.map((a) => a.id) });
      await this.write(familyId, recipients, { kind: NotificationKind.content_reported, eventId });
    });
  }

  /**
   * Turn every reminder that has come due into notifications.
   *
   * Run once a minute (reminders.worker.ts). Safe to run twice at once and
   * safe to miss: a reminder is claimed by setting `deliveredAt` in the same
   * statement that checks it was still unset, so two runs cannot both send it.
   */
  async deliverDueReminders(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.reminder.findMany({
      where: {
        enabled: true,
        deliveredAt: null,
        scheduledFor: { lte: now },
        event: { deletedAt: null },
      },
      select: {
        id: true,
        eventId: true,
        minutesBefore: true,
        scheduledFor: true,
        event: {
          select: {
            familyId: true,
            authorMemberId: true,
            startsAt: true,
            endsAt: true,
            repeat: true,
            repeatUntil: true,
            repeatSkips: true,
            repeatTimeZone: true,
          },
        },
        targets: { select: { memberId: true } },
      },
      take: 200,
    });

    let delivered = 0;

    for (const reminder of due) {
      // Claimed first. If another run got here in between, this one stops.
      const claimed = await this.prisma.reminder.updateMany({
        where: { id: reminder.id, deliveredAt: null },
        data: { deliveredAt: now },
      });
      if (claimed.count === 0) continue;

      // A series has one reminder row that walks along it: once this
      // occurrence is dealt with - sent, or dropped as late - it is pointed at
      // the next one still ahead. A laptop asleep for a week therefore skips
      // the weeks it missed rather than sending them all on waking.
      if (reminder.event.repeat) {
        const next = nextReminderAt(reminder.event, reminder.minutesBefore, now);
        if (next) {
          await this.prisma.reminder.update({
            where: { id: reminder.id },
            data: { scheduledFor: next, deliveredAt: null },
          });
        }
      }

      // Too late to be useful: see STALE_REMINDER_MS. Claimed, so it is never
      // retried, and silent, so nobody gets it. Measured from the occurrence
      // this reminder was for - for a series that is not the series' start.
      const occurrenceStart = reminder.scheduledFor.getTime() + reminder.minutesBefore * 60_000;
      if (now.getTime() - occurrenceStart > STALE_REMINDER_MS) continue;

      const wanted = reminder.targets.length
        ? reminder.targets.map((t) => t.memberId)
        : [reminder.event.authorMemberId];

      await this.safely('event_reminder', async () => {
        // A target who has since lost sight of the event is not reminded of it.
        const recipients = await this.whoCanSee(reminder.event.familyId, reminder.eventId, {
          wants: 'notifyReminders',
          only: wanted,
        });
        await this.write(reminder.event.familyId, recipients, {
          kind: NotificationKind.event_reminder,
          eventId: reminder.eventId,
        });
        delivered += recipients.length;
      });
    }

    return delivered;
  }

  /**
   * Time capsules that have opened and surprises whose moment has come.
   *
   * Run with the reminders, once a minute, and claimed the same way: the
   * event's `unlockNotifiedAt` is set in the statement that checks it was
   * still unset. Not dropped when late, unlike a reminder: a capsule that
   * opened while the laptop slept is still worth hearing about when it wakes.
   */
  async deliverUnlocks(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
        unlockNotifiedAt: null,
        OR: [
          { sealedUntil: { lte: now } },
          { hiddenFromMemberId: { not: null }, revealAt: { lte: now } },
        ],
      },
      select: { id: true, familyId: true, authorMemberId: true, sealedUntil: true, hiddenFromMemberId: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    let told = 0;
    // One surprise_ready per person however many wishes were gathered: the
    // second, third and fourth wish are the same news.
    const surprised = new Set<string>();

    for (const event of due) {
      const claimed = await this.prisma.event.updateMany({
        where: { id: event.id, unlockNotifiedAt: null },
        data: { unlockNotifiedAt: now },
      });
      if (claimed.count === 0) continue;

      await this.safely('unlock', async () => {
        if (event.hiddenFromMemberId) {
          const person = event.hiddenFromMemberId;
          if (surprised.has(person)) return;
          surprised.add(person);
          // Visibility still decides: a surprise the family wrote for the
          // parents only never reaches a child's account.
          const recipients = await this.whoCanSee(event.familyId, event.id, {
            wants: 'notifyEvents',
            only: [person],
          });
          await this.write(event.familyId, recipients, {
            kind: NotificationKind.surprise_ready,
            eventId: event.id,
          });
          told += recipients.length;
          return;
        }

        const recipients = await this.whoCanSee(event.familyId, event.id, {
          wants: 'notifyEvents',
          except: event.authorMemberId,
        });
        await this.write(event.familyId, recipients, {
          kind: NotificationKind.capsule_opened,
          eventId: event.id,
          actorMemberId: event.authorMemberId,
        });
        told += recipients.length;
      });
    }

    return told;
  }

  /**
   * A special day three days ahead: everybody who can sign in and wants
   * reminders hears about it, once. Children's profiles have no account, and
   * nobody is told anything in the name of somebody who has died.
   *
   * Idempotent by the (member, dayKey, dayOn) key - the worker asks every
   * minute, and a restart asks again - and the date is remembered in this
   * process, so the day's later asks do not reach the database at all.
   */
  async deliverSpecialDays(now: Date = new Date()): Promise<number> {
    const local = wallTime(now, SPECIAL_DAY_ZONE);
    if (local.h < SPECIAL_DAY_HOUR) return 0;

    const today = { year: local.y, month: local.m, day: local.d };
    const stamp = `${today.year}-${today.month}-${today.day}`;
    if (this.specialDaysDoneFor === stamp) return 0;

    const ahead = addDays(today, SPECIAL_DAY_LEAD_DAYS);
    const dayKey = specialDayOn(ahead);
    if (!dayKey) {
      this.specialDaysDoneFor = stamp;
      return 0;
    }

    const members = await this.prisma.member.findMany({
      where: {
        status: MemberStatus.active,
        userId: { not: null },
        role: { not: MemberRole.child },
        diedOn: null,
        user: { notifyReminders: true },
        family: { deletedAt: null },
      },
      select: { id: true, familyId: true },
    });

    const dayOn = dayInstant(ahead);
    const written = members.length
      ? await this.prisma.notification.createMany({
          data: members.map((m) => ({
            familyId: m.familyId,
            memberId: m.id,
            kind: NotificationKind.special_day,
            dayKey,
            dayOn,
          })),
          skipDuplicates: true,
        })
      : { count: 0 };

    this.specialDaysDoneFor = stamp;
    // Phones only when this run wrote the day's rows: a restart that finds
    // them written already (skipDuplicates) knocks on nobody's door twice.
    if (written.count > 0) {
      void this.push?.toMembers(
        members.map((m) => m.id),
        NotificationKind.special_day,
      );
    }
    return written.count;
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  /**
   * One person's bell.
   *
   * Filtered by visibility again here, not only at write time: an event made
   * private after the fact must disappear from the bell as it disappears from
   * the timeline, or the notification is the last place it can still be seen.
   */
  async listFor(ctx: ViewerContext): Promise<NotificationView[]> {
    // And not what somebody this person has since blocked did: the block
    // reaches back over the bell as it does over the timeline.
    const blocked = (
      await this.prisma.memberBlock.findMany({
        where: { blockerMemberId: ctx.memberId },
        select: { blockedMemberId: true },
      })
    ).map((b) => b.blockedMemberId);

    const rows = await this.prisma.notification.findMany({
      where: {
        memberId: ctx.memberId,
        familyId: ctx.familyId,
        OR: [
          { eventId: null },
          { event: { AND: [{ deletedAt: null }, this.visibility.eventFilter(ctx)] } },
        ],
        // With a branch for no actor: SQL's NOT IN over a null is null, and
        // would have dropped every notification nobody in particular caused.
        ...(blocked.length > 0
          ? { AND: [{ OR: [{ actorMemberId: null }, { actorMemberId: { notIn: blocked } }] }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      select: {
        id: true,
        kind: true,
        eventId: true,
        actorMemberId: true,
        dayKey: true,
        dayOn: true,
        createdAt: true,
        readAt: true,
        event: { select: { title: true, startsAt: true } },
      },
    });

    // Names read now rather than stored: a rename, or an erased account
    // becoming "Former member", shows up in old notifications too.
    const actorIds = [...new Set(rows.map((r) => r.actorMemberId).filter(Boolean))] as string[];
    const actors = actorIds.length
      ? await this.prisma.member.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, displayName: true },
        })
      : [];
    const nameOf = new Map(actors.map((a) => [a.id, a.displayName]));

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      eventId: row.eventId,
      eventTitle: row.event?.title ?? null,
      eventStartsAt: row.event?.startsAt.toISOString() ?? null,
      actorName: row.actorMemberId ? (nameOf.get(row.actorMemberId) ?? null) : null,
      dayKey: row.dayKey,
      dayOn: row.dayOn?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
    }));
  }

  /** Scoped to the caller, so one person cannot mark another's as read. */
  async markRead(ctx: ViewerContext, notificationId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, memberId: ctx.memberId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(ctx: ViewerContext): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { memberId: ctx.memberId, familyId: ctx.familyId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  // ---------------------------------------------------------------------------

  /**
   * Who, among the people who can sign in and want this kind, can see this event.
   *
   * Asked the database once per member with the timeline's own filter. For a
   * family of at most 25 that is 25 indexed counts - and it means there is no
   * second implementation of "who can see what" anywhere in this codebase.
   */
  private async whoCanSee(
    familyId: string,
    eventId: string,
    options: { wants?: Preference; except?: string; only?: string[] },
  ): Promise<string[]> {
    if (options.only && options.only.length === 0) return [];

    const members = await this.prisma.member.findMany({
      where: {
        familyId,
        status: MemberStatus.active,
        userId: { not: null },
        // The person's own switch, asked before visibility: somebody who said
        // no is not counted at all. A kind with no switch asks nobody.
        ...(options.wants ? { user: { [options.wants]: true } as Prisma.UserWhereInput } : {}),
        // In memoriam: nobody is told anything in the name of somebody gone.
        diedOn: null,
        ...(options.only ? { id: { in: options.only } } : {}),
        ...(options.except ? { NOT: { id: options.except } } : {}),
      },
      select: { id: true, role: true, groupLinks: { select: { groupId: true } } },
    });

    const audience: string[] = [];

    for (const member of members) {
      const ctx: ViewerContext = {
        memberId: member.id,
        familyId,
        role: member.role,
        groupIds: member.groupLinks.map((g) => g.groupId),
      };

      const visible = await this.prisma.event.count({
        where: { AND: [{ id: eventId }, this.visibility.eventFilter(ctx)] },
      });

      if (visible > 0) audience.push(member.id);
    }

    return audience;
  }

  private async write(
    familyId: string,
    memberIds: string[],
    data: { kind: NotificationKind; eventId?: string; actorMemberId?: string },
  ): Promise<void> {
    let recipients = memberIds;

    // Nobody hears about what somebody they blocked did (docs/02-DATA-MODEL.md,
    // Blocks). Asked here, which every kind with an actor passes through,
    // rather than in each kind's own rule.
    if (data.actorMemberId && recipients.length > 0) {
      const blockers = await this.prisma.memberBlock.findMany({
        where: { blockedMemberId: data.actorMemberId, blockerMemberId: { in: recipients } },
        select: { blockerMemberId: true },
      });
      const skip = new Set(blockers.map((b) => b.blockerMemberId));
      recipients = recipients.filter((id) => !skip.has(id));
    }
    if (recipients.length === 0) return;

    await this.prisma.notification.createMany({
      data: recipients.map((memberId) => ({ familyId, memberId, ...data })),
    });

    // The same people's phones, after the rows: the bell is the record, the
    // push only the knock. Not awaited - nobody waits on a phone.
    void this.push?.toMembers(recipients, data.kind, { eventId: data.eventId });
  }

  private async safely(what: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(`Could not write ${what} notifications`, error as Error);
    }
  }
}
