import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberStatus, Prisma, VisibilityKind } from '@prisma/client';

import { AuditService } from '../../common/audit.service';
import { LIMITS, categoryId, instant, optionalText, requiredText, tagList } from '../../common/input';
import { PrismaService } from '../../common/prisma.service';
import { isKnownZone, nextReminderAt, type RepeatRule, type Series } from '../../common/recurrence';
import { NotificationsService } from '../notifications/notifications.service';
import { PLAN_SELECT, isPremium } from '../subscriptions/premium';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';
import type { CreateEventDto, ListEventsQuery, UpdateEventDto } from './events.dto';

/** The free plan limit. Kept in sync with apps/mobile/src/domain/plans.ts. */
const FREE_MAX_EVENTS = 50;

/** The category whose entries are health data (apps/mobile/src/domain/categories.ts). */
const HEALTH = 'health';

/**
 * WHAT EVERY EVENT THE API HANDS BACK CARRIES - from the list, from one event,
 * from a create, an edit, a restore, a change of audience. The same everywhere.
 *
 * The app replaces its copy with whatever comes back. A create answered
 * without its reminder, and an edit answered without its photographs,
 * reactions and comment count, so after every save those vanished from the
 * screen until the next refresh - and one event opened on its own always said
 * "no comments". Found 2026-09-24 by apps/mobile/src/data/api.integration.test.ts,
 * the test that reads the API through the app's own client.
 *
 * The viewer's own, because of blocks: the reactions and the comment count
 * leave out whoever this viewer blocked (docs/02-DATA-MODEL.md, Blocks), as
 * the comments themselves do (comments.service.ts).
 */
function eventReply(ctx: ViewerContext) {
  const unblocked = { blockedBy: { none: { blockerMemberId: ctx.memberId } } };
  return {
    participants: { select: { memberId: true } },
    visibility: { select: { groupId: true, memberId: true } },
    attachments: { where: { uploadedAt: { not: null } }, orderBy: { createdAt: 'asc' } },
    reactions: { where: { member: unblocked }, select: { memberId: true, kind: true } },
    reminders: { where: { enabled: true }, take: 1 },
    _count: { select: { comments: { where: { deletedAt: null, author: unblocked } } } },
  } satisfies Prisma.EventInclude;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  /**
   * Timeline and calendar.
   *
   * The visibility filter is part of the `where`, not post-processing. See the
   * comment in VisibilityService — filtering in the response would leak the
   * existence of hidden events through the pagination count.
   */
  async list(ctx: ViewerContext, query: ListEventsQuery) {
    const filters: Prisma.EventWhereInput[] = [this.visibility.eventFilter(ctx)];

    if (query.from || query.to) {
      filters.push({
        startsAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      });
    }
    if (query.categoryId) filters.push({ categoryId: query.categoryId });
    // A query string is text, and "false" is a non-empty string: only an
    // explicit yes turns these on.
    if (String(query.milestonesOnly) === 'true') filters.push({ isMilestone: true });
    if (String(query.repeating) === 'true') filters.push({ repeat: { not: null } });
    if (String(query.onStoryShelf) === 'true') filters.push({ onStoryShelf: true });
    if (query.participantId) {
      filters.push({ participants: { some: { memberId: query.participantId } } });
    }
    if (query.q) {
      const now = new Date();
      filters.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          // The words inside a closed time capsule cannot be searched by
          // anybody who may not read them: a match would say what is in it.
          {
            AND: [
              { description: { contains: query.q, mode: 'insensitive' } },
              {
                OR: [
                  { sealedUntil: null },
                  { sealedUntil: { lte: now } },
                  { authorMemberId: ctx.memberId },
                ],
              },
            ],
          },
        ],
      });
    }

    const limit = Math.min(query.limit ?? 20, 50);

    const events = await this.prisma.event.findMany({
      where: { AND: filters },
      // The id breaks ties: two events at the same moment would otherwise
      // come back in either order, and a page boundary between them would
      // show one twice and the other never.
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: eventReply(ctx),
    });

    const hasMore = events.length > limit;
    return {
      items: events.slice(0, limit).map((event) => this.present(ctx, event)),
      nextCursor: hasMore ? events[limit - 1].id : null,
    };
  }

  async findOne(ctx: ViewerContext, eventId: string) {
    await this.visibility.assertCanSeeEvent(ctx, eventId);

    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      include: {
        ...eventReply(ctx),
        // The role, for the audit below - and only the role. This used to be
        // the whole member row, storage key and birthday included, in a reply
        // that only needed an id.
        participants: { select: { memberId: true, member: { select: { role: true } } } },
      },
    });

    // Access to children's data is logged separately.
    const childParticipant = event.participants.find((p) => p.member.role === 'child');
    if (childParticipant) {
      await this.audit.record({
        familyId: ctx.familyId,
        action: 'child_profile.viewed',
        entityType: 'Event',
        entityId: event.id,
        metadata: { viewerRole: ctx.role },
      });
    }

    return this.present(ctx, event);
  }

  // -------------------------------------------------------------------------
  // Writing
  // -------------------------------------------------------------------------

  async create(ctx: ViewerContext, dto: CreateEventDto) {
    this.visibility.assertCan(ctx, 'event.create');
    // What was typed, checked before anything is read or written (common/input.ts).
    const title = requiredText(dto.title, LIMITS.eventTitle, 'invalid_title', 'A title');
    const description = optionalText(dto.description, LIMITS.eventDescription, 'invalid_description', 'A description');
    const category = categoryId(dto.categoryId);
    const tags = tagList(dto.tags) ?? [];
    await this.assertWithinPlanLimit(ctx.familyId);
    if (category === HEALTH) await this.assertHealthConsent(ctx);

    // When the client sends no visibility, the server applies the safe default
    // itself. The client is not trusted: an API call can come from anywhere.
    const visibility = dto.visibility
      ? await this.audienceInFamily(ctx.familyId, dto.visibility)
      : await this.visibility.defaultVisibilityFor(ctx.familyId, dto.participantMemberIds ?? []);

    const repeat = repeatData(dto);
    const startsAt = instant(dto.startsAt, 'The start');
    const endsAt = dto.endsAt ? instant(dto.endsAt, 'The end') : null;
    const sealedUntil = sealDate(dto.sealedUntil, { mustBeAhead: true });
    const surprise = await this.surpriseData(ctx, dto);

    const created = await this.prisma.event.create({
      data: {
        familyId: ctx.familyId,
        authorMemberId: ctx.memberId,
        title,
        description,
        startsAt,
        endsAt,
        allDay: dto.allDay ?? false,
        categoryId: category,
        tags,
        isMilestone: dto.isMilestone ?? false,
        ...repeat,
        // A key, not text: anything else is dropped rather than stored.
        promptKey: dto.promptKey && PROMPT_KEY.test(dto.promptKey) ? dto.promptKey : null,
        sealedUntil: sealedUntil ?? null,
        ...surprise,
        onStoryShelf: dto.onStoryShelf === true,
        visibilityKind: visibility.kind,
        participants: {
          create: (dto.participantMemberIds ?? []).map((memberId) => ({ memberId })),
        },
        visibility: {
          create: buildVisibilityRows(visibility),
        },
        ...(dto.reminder
          ? {
              reminders: {
                create: {
                  minutesBefore: dto.reminder.minutesBefore,
                  // For a series, the next occurrence still ahead - a weekly
                  // practice entered on a Thursday that began on Monday is
                  // reminded of next Monday, not dropped as late.
                  scheduledFor: reminderTime(
                    { startsAt, endsAt, ...repeat },
                    dto.reminder.minutesBefore,
                  ),
                },
              },
            }
          : {}),
      },
      include: eventReply(ctx),
    });

    // Not awaited: the bell is a consequence of the family's action, and the
    // person who just saved a memory should not wait for everybody else to be
    // told about it. It never throws (notifications.service.ts).
    void this.notifications.eventCreated(ctx.familyId, created.id, ctx.memberId);

    return this.present(ctx, created);
  }

  /**
   * Editing an event.
   *
   * Visibility is deliberately NOT editable here — `UpdateEventDto` omits it
   * and `changeVisibility` is the only way in, because that path writes the
   * audit entry. An edit that could quietly widen who can see a photograph of
   * a child would defeat the whole model.
   *
   * The one exception is narrowing, below.
   */
  async update(ctx: ViewerContext, eventId: string, dto: UpdateEventDto) {
    await this.visibility.assertCanSeeEvent(ctx, eventId);

    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: {
        authorMemberId: true,
        categoryId: true,
        startsAt: true,
        endsAt: true,
        visibilityKind: true,
        repeat: true,
        repeatUntil: true,
        repeatSkips: true,
        repeatTimeZone: true,
        sealedUntil: true,
      },
    });
    // Into the Health category is a new health entry; one already there is not.
    if (dto.categoryId === HEALTH && event.categoryId !== HEALTH) await this.assertHealthConsent(ctx);

    const mayEdit =
      this.visibility.can(ctx, 'event.edit_any') ||
      (event.authorMemberId === ctx.memberId && this.visibility.can(ctx, 'event.edit_own'));

    if (!mayEdit) {
      throw new ForbiddenException({ code: 'insufficient_role', message: 'Cannot edit event.' });
    }

    // Nobody edits what they may not read: an admin writing over a closed
    // capsule would be changing words they have never seen.
    if (this.visibility.isSealedFor(ctx, event)) {
      throw new ForbiddenException({ code: 'capsule_sealed', message: 'This time capsule is not open yet.' });
    }
    // When it opens is the author's to say, and theirs alone.
    if (dto.sealedUntil !== undefined && event.authorMemberId !== ctx.memberId) {
      throw new ForbiddenException({
        code: 'insufficient_role',
        message: 'Only whoever sealed a time capsule can change when it opens.',
      });
    }
    // The author may open it early (null, or a day already past) or push it on.
    const sealedUntil = sealDate(dto.sealedUntil, { mustBeAhead: false });

    // What was typed, as on creation; anything not sent is left as it was.
    const title =
      dto.title !== undefined ? requiredText(dto.title, LIMITS.eventTitle, 'invalid_title', 'A title') : undefined;
    const description = optionalText(dto.description, LIMITS.eventDescription, 'invalid_description', 'A description');
    const category = dto.categoryId !== undefined ? categoryId(dto.categoryId) : undefined;
    const tags = tagList(dto.tags);

    const startsAt = dto.startsAt ? instant(dto.startsAt, 'The start') : event.startsAt;
    const endsAt =
      dto.endsAt !== undefined ? (dto.endsAt ? instant(dto.endsAt, 'The end') : null) : event.endsAt;
    const repeat = repeatData(dto);

    // The schedule as it will be once this is saved, for the reminder to be
    // counted from. Anything the caller did not send is as it was.
    const series = {
      startsAt,
      endsAt,
      repeat: repeat.repeat !== undefined ? repeat.repeat : event.repeat,
      repeatUntil: repeat.repeatUntil !== undefined ? repeat.repeatUntil : event.repeatUntil,
      repeatSkips: repeat.repeatSkips ?? event.repeatSkips,
      repeatTimeZone:
        repeat.repeatTimeZone !== undefined ? repeat.repeatTimeZone : event.repeatTimeZone,
    };
    const scheduleMoved =
      dto.startsAt !== undefined || dto.endsAt !== undefined || Object.keys(repeat).length > 0;

    const updated = await this.prisma.$transaction(async (tx) => {
      // Participants and the reminder are replaced wholesale rather than
      // merged: the client sends the state it wants, and a partial merge would
      // make "remove the last participant" impossible to express.
      if (dto.participantMemberIds) {
        await tx.eventParticipant.deleteMany({ where: { eventId } });
      }
      if (dto.reminder !== undefined) {
        await tx.reminder.deleteMany({ where: { eventId } });
      } else if (scheduleMoved) {
        // The reminder stays, and follows the event. It used to stay at the
        // old time: moving a dentist's appointment to Friday still reminded
        // everybody on Wednesday.
        const kept = await tx.reminder.findMany({
          where: { eventId },
          select: { id: true, minutesBefore: true },
        });
        for (const reminder of kept) {
          await tx.reminder.update({
            where: { id: reminder.id },
            data: {
              scheduledFor: reminderTime(series, reminder.minutesBefore),
              deliveredAt: null,
            },
          });
        }
      }

      return tx.event.update({
        where: { id: eventId },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(dto.startsAt !== undefined ? { startsAt } : {}),
          ...(dto.endsAt !== undefined ? { endsAt } : {}),
          ...(dto.allDay !== undefined ? { allDay: dto.allDay } : {}),
          ...(category !== undefined ? { categoryId: category } : {}),
          ...(tags !== undefined ? { tags } : {}),
          ...(dto.isMilestone !== undefined ? { isMilestone: dto.isMilestone } : {}),
          ...(sealedUntil !== undefined ? { sealedUntil, unlockNotifiedAt: null } : {}),
          ...(typeof dto.onStoryShelf === 'boolean' ? { onStoryShelf: dto.onStoryShelf } : {}),
          ...repeat,
          ...(dto.participantMemberIds
            ? {
                participants: {
                  create: dto.participantMemberIds.map((memberId) => ({ memberId })),
                },
              }
            : {}),
          ...(dto.reminder
            ? {
                reminders: {
                  create: {
                    minutesBefore: dto.reminder.minutesBefore,
                    scheduledFor: reminderTime(series, dto.reminder.minutesBefore),
                  },
                },
              }
            : {}),
        },
        include: eventReply(ctx),
      });
    });

    // A child added to an event that the whole family can see narrows it, the
    // same way creating one would. The client already does this, but the client
    // is not the boundary — an API call can come from anywhere, and this is the
    // rule the regulator asks about.
    if (dto.participantMemberIds && event.visibilityKind === VisibilityKind.family) {
      const narrowed = await this.narrowForChildren(ctx, eventId, dto.participantMemberIds);
      if (narrowed) return narrowed;
    }

    return this.present(ctx, updated);
  }

  /**
   * Deleting an event.
   *
   * Soft, always. The comments hang off it and the app offers an undo, so the
   * row has to survive long enough to come back unchanged — a new id would
   * orphan every reaction and reminder pointing at it. `eventFilter` already
   * excludes `deletedAt`, so one timestamp hides it everywhere at once.
   */
  async remove(ctx: ViewerContext, eventId: string) {
    await this.visibility.assertCanSeeEvent(ctx, eventId);

    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { authorMemberId: true },
    });

    const mayDelete =
      this.visibility.can(ctx, 'event.delete_any') ||
      (event.authorMemberId === ctx.memberId && this.visibility.can(ctx, 'event.edit_own'));

    if (!mayDelete) {
      throw new ForbiddenException({ code: 'insufficient_role', message: 'Cannot delete event.' });
    }

    await this.prisma.event.update({
      where: { id: eventId },
      data: { deletedAt: new Date() },
    });

    await this.audit.record({
      familyId: ctx.familyId,
      action: 'event.deleted',
      entityType: 'Event',
      entityId: eventId,
      metadata: { byRole: ctx.role },
    });
  }

  /**
   * Undo.
   *
   * The app offers "Undo" for a few seconds after a delete, and that offer has
   * to survive the app being closed and reopened — so the undo is a request,
   * not a timer the client keeps to itself.
   *
   * `assertCanSeeEvent` cannot be used here: the event is already invisible by
   * definition. So the ownership check reads the row directly, and a deleted
   * event in another family is a plain 404.
   */
  async restore(ctx: ViewerContext, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, familyId: ctx.familyId, deletedAt: { not: null } },
      select: { authorMemberId: true },
    });

    if (!event) {
      throw new NotFoundException({ code: 'not_found', message: 'No deleted event with that id.' });
    }

    const mayRestore =
      this.visibility.can(ctx, 'event.delete_any') ||
      (event.authorMemberId === ctx.memberId && this.visibility.can(ctx, 'event.edit_own'));

    if (!mayRestore) {
      throw new ForbiddenException({ code: 'insufficient_role', message: 'Cannot restore event.' });
    }

    const restored = await this.prisma.event.update({
      where: { id: eventId },
      data: { deletedAt: null },
      include: eventReply(ctx),
    });

    await this.audit.record({
      familyId: ctx.familyId,
      action: 'event.restored',
      entityType: 'Event',
      entityId: eventId,
      metadata: { byRole: ctx.role },
    });

    return this.present(ctx, restored);
  }

  /**
   * If any of these participants is a child, apply the same default the create
   * path applies and record it. Returns the updated event, or null when nothing
   * needed narrowing.
   */
  private async narrowForChildren(
    ctx: ViewerContext,
    eventId: string,
    participantMemberIds: string[],
  ) {
    const childCount = await this.prisma.member.count({
      where: { id: { in: participantMemberIds }, familyId: ctx.familyId, role: 'child' },
    });
    if (childCount === 0) return null;

    const safe = await this.visibility.defaultVisibilityFor(ctx.familyId, participantMemberIds);
    if (safe.kind === VisibilityKind.family) return null;

    return this.changeVisibility(ctx, eventId, safe);
  }

  async changeVisibility(
    ctx: ViewerContext,
    eventId: string,
    next: { kind: VisibilityKind; groupIds?: string[]; memberIds?: string[] },
  ) {
    await this.visibility.assertCanSeeEvent(ctx, eventId);

    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { authorMemberId: true, visibilityKind: true },
    });

    const mayEdit =
      this.visibility.can(ctx, 'event.edit_any') ||
      (event.authorMemberId === ctx.memberId && this.visibility.can(ctx, 'event.edit_own'));

    if (!mayEdit) {
      throw new ForbiddenException({ code: 'insufficient_role', message: 'Cannot edit event.' });
    }

    const audience = await this.audienceInFamily(ctx.familyId, next);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.eventVisibility.deleteMany({ where: { eventId } });
      return tx.event.update({
        where: { id: eventId },
        data: {
          visibilityKind: audience.kind,
          visibility: { create: buildVisibilityRows(audience) },
        },
        include: eventReply(ctx),
      });
    });

    // A visibility change always reaches the audit log — it is exactly the
    // action that gets asked about after an incident.
    await this.audit.record({
      familyId: ctx.familyId,
      action: 'event.visibility_changed',
      entityType: 'Event',
      entityId: eventId,
      metadata: { from: event.visibilityKind, to: audience.kind },
    });

    return this.present(ctx, updated);
  }

  /**
   * The audience a client asked for, cut down to what exists in this family.
   *
   * A group or a person from somewhere else can never match a viewer here
   * (`eventFilter` pins the family), so dropping them changes nobody's view;
   * keeping them would be a row that points outside the family, or a foreign
   * key error for an id that is not anybody's. What is left can only be
   * narrower than what was asked for, never wider.
   *
   * An audience with nobody left in it is written as `private`, which is what
   * it already was in effect: an empty list matches no one but the author.
   */
  private async audienceInFamily(
    familyId: string,
    asked: { kind: VisibilityKind; groupIds?: string[]; memberIds?: string[] },
  ): Promise<{ kind: VisibilityKind; groupIds?: string[]; memberIds?: string[] }> {
    const named: VisibilityKind[] = [
      VisibilityKind.custom,
      VisibilityKind.groups,
      VisibilityKind.members,
    ];
    if (!named.includes(asked.kind)) return { kind: asked.kind };

    const wantsGroups = asked.kind !== VisibilityKind.members;
    const wantsMembers = asked.kind !== VisibilityKind.groups;
    const askedGroups = wantsGroups ? [...new Set(asked.groupIds ?? [])] : [];
    const askedMembers = wantsMembers ? [...new Set(asked.memberIds ?? [])] : [];

    const [groups, members] = await Promise.all([
      askedGroups.length > 0
        ? this.prisma.group.findMany({
            where: { familyId, id: { in: askedGroups } },
            select: { id: true },
          })
        : [],
      askedMembers.length > 0
        ? this.prisma.member.findMany({
            where: { familyId, id: { in: askedMembers }, status: { not: 'removed' } },
            select: { id: true },
          })
        : [],
    ]);

    const groupIds = askedGroups.filter((id) => groups.some((g) => g.id === id));
    const memberIds = askedMembers.filter((id) => members.some((m) => m.id === id));

    if (groupIds.length === 0 && memberIds.length === 0) return { kind: VisibilityKind.private };
    return { kind: asked.kind, groupIds, memberIds };
  }

  /**
   * What goes back to this viewer. A time capsule still closed to them goes
   * back as its envelope - the title, the date, who it is about and when it
   * opens - and nothing that is in it. The contents are not hidden by the app;
   * they never leave the server. `sealed` tells the app which it has.
   */
  private present<T extends { sealedUntil?: Date | null; authorMemberId: string }>(
    ctx: ViewerContext,
    event: T,
  ): T & { sealed: boolean } {
    if (!this.visibility.isSealedFor(ctx, event)) return { ...event, sealed: false };
    return {
      ...event,
      sealed: true,
      description: null,
      tags: [],
      attachments: [],
      reactions: [],
      reminders: [],
      _count: { comments: 0 },
    } as T & { sealed: boolean };
  }

  /**
   * The surprise fields of a new event, checked: somebody else in this family,
   * and a moment ahead - within a year and a bit, since a surprise is for a
   * birthday coming up, not a way to hide an event from somebody for good.
   */
  private async surpriseData(
    ctx: ViewerContext,
    dto: CreateEventDto,
  ): Promise<{ hiddenFromMemberId?: string; revealAt?: Date }> {
    if (dto.surpriseFor === undefined && dto.revealAt === undefined) return {};

    const revealAt = dto.revealAt ? new Date(dto.revealAt) : null;
    const ahead = revealAt ? revealAt.getTime() - Date.now() : Number.NaN;
    const refuse = (message: string) =>
      new BadRequestException({ code: 'invalid_surprise', message });

    if (!dto.surpriseFor || !revealAt || !(ahead > 0) || ahead > MAX_SURPRISE_MS) {
      throw refuse('A surprise needs somebody in the family and a moment ahead to show it to them.');
    }
    if (dto.surpriseFor === ctx.memberId) throw refuse('A surprise is for somebody else.');

    const target = await this.prisma.member.findFirst({
      where: { id: dto.surpriseFor, familyId: ctx.familyId, status: MemberStatus.active },
      select: { id: true },
    });
    if (!target) throw refuse('A surprise is for somebody in this family.');

    return { hiddenFromMemberId: target.id, revealAt };
  }

  // -------------------------------------------------------------------------

  /**
   * Health information is special (GDPR Art. 9): an entry in the Health
   * category needs its author's explicit consent, given in the app before the
   * first one and withdrawable in Settings (docs/02-DATA-MODEL.md, User).
   * The app asks; this is what holds when an app does not.
   */
  private async assertHealthConsent(ctx: ViewerContext): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { id: ctx.memberId },
      select: { user: { select: { healthConsentAt: true } } },
    });
    if (member?.user?.healthConsentAt) return;
    throw new ForbiddenException({
      code: 'health_consent_required',
      message: 'An entry about health needs your consent first.',
    });
  }

  private async assertWithinPlanLimit(familyId: string): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { familyId },
      select: PLAN_SELECT,
    });
    if (isPremium(subscription)) return;

    const count = await this.prisma.event.count({ where: { familyId, deletedAt: null } });
    if (count >= FREE_MAX_EVENTS) {
      throw new ForbiddenException({
        code: 'plan_limit_reached',
        message: 'Free plan event limit reached.',
        limit: FREE_MAX_EVENTS,
      });
    }
  }
}

const REPEAT_RULES: readonly RepeatRule[] = ['daily', 'weekly', 'monthly', 'yearly'];
/** The question-of-the-week keys the app uses: "childhood-home", "first-job". */
const PROMPT_KEY = /^[a-z0-9-]{1,40}$/;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
/** Twenty years of skipped weeks; a guard against a client sending a novel. */
const MAX_SKIPS = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A time capsule may wait a century: a letter to a grandchild not yet born. */
const MAX_SEAL_MS = 100 * 366 * DAY_MS;
/** A surprise is for a birthday coming up: a year and a bit at most. */
const MAX_SURPRISE_MS = 400 * DAY_MS;

/**
 * When a time capsule opens, checked. Undefined leaves it as it is, null opens
 * it. A new capsule must open in the future; the author may later open theirs
 * early with a day already past. Never more than a century ahead.
 */
export function sealDate(
  value: string | null | undefined,
  { mustBeAhead }: { mustBeAhead: boolean },
): Date | null | undefined {
  if (value === undefined || value === null) return value;

  const at = new Date(value);
  const ahead = at.getTime() - Date.now();
  if (Number.isNaN(ahead) || (mustBeAhead && ahead <= 0) || ahead > MAX_SEAL_MS) {
    throw new BadRequestException({
      code: 'invalid_seal',
      message: 'A time capsule opens on a date ahead, within a hundred years.',
    });
  }
  return at;
}

type RepeatData = {
  repeat?: RepeatRule | null;
  repeatUntil?: Date | null;
  repeatTimeZone?: string | null;
  repeatSkips?: string[];
};

/**
 * The repeat fields of a create or an update, checked - and only the ones the
 * caller sent, so an edit that says nothing about repeating leaves it alone.
 *
 * A rule the server does not know is refused rather than dropped: saving
 * "every fortnight" as a one-off would lose what the person asked for without
 * telling them. A zone it does not know becomes no zone (the server's own),
 * which moves the series by at most the difference and loses nothing.
 */
export function repeatData(dto: {
  repeat?: string | null;
  repeatUntil?: string | null;
  repeatTimeZone?: string | null;
  repeatSkips?: unknown;
}): RepeatData {
  const out: RepeatData = {};

  if (dto.repeat !== undefined) {
    if (dto.repeat !== null && !REPEAT_RULES.includes(dto.repeat as RepeatRule)) {
      throw new BadRequestException({
        code: 'invalid_repeat',
        message: 'repeat must be daily, weekly, monthly or yearly.',
      });
    }
    out.repeat = dto.repeat as RepeatRule | null;
  }

  if (dto.repeatUntil !== undefined) {
    const until = dto.repeatUntil === null ? null : new Date(dto.repeatUntil);
    if (until && Number.isNaN(until.getTime())) {
      throw new BadRequestException({
        code: 'invalid_repeat_until',
        message: 'repeatUntil must be a date.',
      });
    }
    out.repeatUntil = until;
  }

  if (dto.repeatTimeZone !== undefined) {
    out.repeatTimeZone =
      dto.repeatTimeZone && isKnownZone(dto.repeatTimeZone) ? dto.repeatTimeZone : null;
  }

  if (dto.repeatSkips !== undefined) {
    const days = Array.isArray(dto.repeatSkips) ? dto.repeatSkips : [];
    out.repeatSkips = [
      ...new Set(days.filter((d): d is string => typeof d === 'string' && DAY_KEY.test(d))),
    ].slice(0, MAX_SKIPS);
  }

  return out;
}

/**
 * When a reminder should go off for this schedule: before the next occurrence
 * still ahead for a series, before the start for a one-off. A series that is
 * over gets its last start, which the worker then drops as late.
 */
function reminderTime(series: Series, minutesBefore: number): Date {
  return (
    nextReminderAt(series, minutesBefore, new Date()) ??
    new Date(new Date(series.startsAt).getTime() - minutesBefore * 60_000)
  );
}

export function buildVisibilityRows(v: {
  kind: VisibilityKind;
  groupIds?: string[];
  memberIds?: string[];
}): { groupId?: string; memberId?: string }[] {
  const groupRows = (v.groupIds ?? []).map((groupId) => ({ groupId }));
  const memberRows = (v.memberIds ?? []).map((memberId) => ({ memberId }));

  switch (v.kind) {
    case VisibilityKind.groups:
      return groupRows;
    case VisibilityKind.members:
      return memberRows;
    // Both lists at once - the design's "groups and people" in one audience.
    // This case was missing: a custom event was saved with no rows at all,
    // and so reached nobody but its author, whoever had been picked.
    case VisibilityKind.custom:
      return [...groupRows, ...memberRows];
    // family and private need no rows at all.
    default:
      return [];
  }
}
