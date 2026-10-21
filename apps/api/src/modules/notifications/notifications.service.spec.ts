import { MemberRole } from '@prisma/client';

import type { PrismaService } from '../../common/prisma.service';
import type { PushService } from '../push/push.service';
import type { VisibilityService, ViewerContext } from '../visibility/visibility.service';
import { NotificationsService } from './notifications.service';

/**
 * The bell.
 *
 * The rule these tests are for: a notification must never be the place an
 * event leaks. Who is told is decided by the timeline's own visibility filter
 * - here stood in for by a list of who may see the event - and a member who
 * cannot see it, or who cannot sign in, must never get a row.
 */

interface Person {
  id: string;
  role?: MemberRole;
  /** Settings switches this person turned off (User.notify*). */
  off?: string[];
}

/** The parts of a member query the service builds and these tests read back. */
interface MemberWhere {
  id?: { in?: string[]; not?: string; notIn?: string[] };
  NOT?: { id: string };
  userId?: unknown;
  role?: MemberRole;
  user?: Record<string, boolean>;
}

function build(options: {
  members?: Person[];
  /** Member ids the stand-in visibility filter lets through. */
  canSee?: string[];
  event?: { authorMemberId: string; comments: { authorMemberId: string }[] } | null;
  reminders?: unknown[];
  claimed?: number;
  /** Who blocked whom (MemberBlock). */
  blocks?: { blocker: string; blocked: string }[];
} = {}) {
  const written: { familyId: string; memberId: string; kind: string; eventId?: string }[] = [];

  const prisma = {
    memberBlock: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: { blockedMemberId?: string; blockerMemberId?: string | { in: string[] } };
        }) =>
          (options.blocks ?? [])
            .filter((b) => where.blockedMemberId === undefined || b.blocked === where.blockedMemberId)
            .filter((b) => {
              const blocker = where.blockerMemberId;
              if (blocker === undefined) return true;
              return typeof blocker === 'string' ? b.blocker === blocker : blocker.in.includes(b.blocker);
            })
            .map((b) => ({ blockerMemberId: b.blocker, blockedMemberId: b.blocked })),
      ),
    },
    member: {
      findMany: jest.fn(async ({ where }: { where: MemberWhere }) => {
        let people = options.members ?? [];
        if (where.id?.in) people = people.filter((p) => where.id?.in?.includes(p.id));
        if (where.id?.not) people = people.filter((p) => p.id !== where.id?.not);
        if (where.id?.notIn) people = people.filter((p) => !where.id?.notIn?.includes(p.id));
        if (where.NOT?.id) people = people.filter((p) => p.id !== where.NOT?.id);
        if (where.role) people = people.filter((p) => (p.role ?? MemberRole.member) === where.role);
        // The account's switches: a field asked to be true drops whoever has it off.
        const wanted = Object.keys(where.user ?? {});
        people = people.filter((p) => !wanted.some((field) => (p.off ?? []).includes(field)));
        return people.map((p) => ({ id: p.id, role: p.role ?? MemberRole.member, groupLinks: [] }));
      }),
    },
    event: {
      // The visibility filter is a marker naming the viewer; this is where the
      // stand-in decides who may see the event.
      count: jest.fn(async ({ where }: { where: { AND: [unknown, { viewer: string }] } }) =>
        (options.canSee ?? []).includes(where.AND[1].viewer) ? 1 : 0,
      ),
      findUnique: jest.fn(async () => options.event ?? null),
    },
    notification: {
      createMany: jest.fn(async ({ data }: { data: typeof written }) => {
        written.push(...data);
        return { count: data.length };
      }),
      findMany: jest.fn(async (_args: { where: Record<string, unknown> }) => []),
      updateMany: jest.fn(async (_args: { where: Record<string, unknown> }) => ({ count: 1 })),
    },
    reminder: {
      findMany: jest.fn(async (_args: unknown) => options.reminders ?? []),
      updateMany: jest.fn(async (_args: { where: Record<string, unknown> }) => ({
        count: options.claimed ?? 1,
      })),
      update: jest.fn(async (_args: { where: { id: string }; data: Record<string, unknown> }) => ({})),
    },
  };

  const visibility = {
    eventFilter: (ctx: ViewerContext) => ({ viewer: ctx.memberId }),
  } as unknown as VisibilityService;

  // The phones: what the bell hands on, recorded.
  const pushed: { memberIds: string[]; kind: string; eventId?: string | null }[] = [];
  const push = {
    toMembers: jest.fn(async (memberIds: string[], kind: string, data: { eventId?: string | null } = {}) => {
      pushed.push({ memberIds, kind, eventId: data.eventId });
      return memberIds.length;
    }),
  } as unknown as PushService;

  return {
    service: new NotificationsService(prisma as unknown as PrismaService, visibility, push),
    prisma,
    written,
    pushed,
  };
}

describe('The phones', () => {
  it('are told about exactly the people the bell chose, after the rows are written', async () => {
    const { service, written, pushed } = build({
      members: [{ id: 'anna' }, { id: 'martin' }, { id: 'vera' }],
      // Parents only: the grandmother's phone hears nothing either.
      canSee: ['anna', 'martin'],
    });

    await service.eventCreated('fam', 'evt', 'anna');

    expect(recipients(written)).toEqual(['martin']);
    expect(pushed).toEqual([{ memberIds: ['martin'], kind: 'event_created', eventId: 'evt' }]);
  });

  it('nobody chosen, nobody knocked on', async () => {
    const { service, pushed } = build({ members: [{ id: 'anna' }], canSee: ['anna'] });
    await service.eventCreated('fam', 'evt', 'anna');
    expect(pushed).toEqual([]);
  });
});

const recipients = (written: { memberId: string }[]) => written.map((w) => w.memberId).sort();

describe('A new event', () => {
  it('tells everybody who can see it, except whoever wrote it', async () => {
    const { service, written } = build({
      members: [{ id: 'anna' }, { id: 'martin' }, { id: 'vera' }],
      canSee: ['anna', 'martin', 'vera'],
    });

    await service.eventCreated('fam', 'evt', 'anna');

    expect(recipients(written)).toEqual(['martin', 'vera']);
  });

  it('tells nobody who cannot see it', async () => {
    const { service, written } = build({
      members: [{ id: 'anna' }, { id: 'martin' }, { id: 'vera' }],
      // A parents-only event: the grandmother must not learn it exists.
      canSee: ['anna', 'martin'],
    });

    await service.eventCreated('fam', 'evt', 'anna');

    expect(recipients(written)).toEqual(['martin']);
  });

  it('only ever asks about people who can sign in', async () => {
    const { service, prisma } = build({ members: [], canSee: [] });

    await service.eventCreated('fam', 'evt', 'anna');

    // A child profile has no account: nobody to tell, and a row about a
    // child's family would be data nothing reads.
    expect(prisma.member.findMany.mock.calls[0][0].where.userId).toEqual({ not: null });
  });

  it('skips somebody who turned new events off', async () => {
    const { service, written, prisma } = build({
      members: [{ id: 'anna' }, { id: 'martin', off: ['notifyEvents'] }, { id: 'vera' }],
      canSee: ['anna', 'martin', 'vera'],
    });

    await service.eventCreated('fam', 'evt', 'anna');

    expect(recipients(written)).toEqual(['vera']);
    expect(prisma.member.findMany.mock.calls[0][0].where.user).toEqual({ notifyEvents: true });
  });

  it('never fails the thing that caused it', async () => {
    const { service, prisma } = build({ members: [{ id: 'martin' }], canSee: ['martin'] });
    prisma.notification.createMany.mockRejectedValueOnce(new Error('database away'));

    await expect(service.eventCreated('fam', 'evt', 'anna')).resolves.toBeUndefined();
  });
});

describe('A comment', () => {
  it('reaches the conversation, not the whole family', async () => {
    const { service, written } = build({
      members: [{ id: 'anna' }, { id: 'martin' }, { id: 'vera' }, { id: 'robert' }],
      canSee: ['anna', 'martin', 'vera', 'robert'],
      event: { authorMemberId: 'anna', comments: [{ authorMemberId: 'vera' }] },
    });

    await service.commentAdded('fam', 'evt', 'martin');

    // The author and the earlier commenter. Robert never joined in.
    expect(recipients(written)).toEqual(['anna', 'vera']);
  });

  it('skips somebody in the conversation who turned comments off', async () => {
    const { service, written } = build({
      members: [{ id: 'anna', off: ['notifyComments'] }, { id: 'martin' }, { id: 'vera' }],
      canSee: ['anna', 'martin', 'vera'],
      event: { authorMemberId: 'anna', comments: [{ authorMemberId: 'vera' }] },
    });

    await service.commentAdded('fam', 'evt', 'martin');

    expect(recipients(written)).toEqual(['vera']);
  });

  it('does not tell somebody about their own reply', async () => {
    const { service, written } = build({
      members: [{ id: 'anna' }],
      canSee: ['anna'],
      event: { authorMemberId: 'anna', comments: [] },
    });

    await service.commentAdded('fam', 'evt', 'anna');

    expect(written).toHaveLength(0);
  });
});

describe('A block', () => {
  it('a comment by somebody you blocked does not reach you; the rest of the conversation still hears', async () => {
    const { service, written } = build({
      members: [{ id: 'anna' }, { id: 'martin' }, { id: 'vera' }],
      canSee: ['anna', 'martin', 'vera'],
      event: { authorMemberId: 'anna', comments: [{ authorMemberId: 'vera' }] },
      blocks: [{ blocker: 'anna', blocked: 'martin' }],
    });

    await service.commentAdded('fam', 'evt', 'martin');

    expect(recipients(written)).toEqual(['vera']);
  });

  it('only the blocker is spared: being blocked changes nothing for the blocked', async () => {
    const { service, written } = build({
      members: [{ id: 'anna' }, { id: 'martin' }],
      canSee: ['anna', 'martin'],
      event: { authorMemberId: 'martin', comments: [] },
      blocks: [{ blocker: 'anna', blocked: 'martin' }],
    });

    await service.commentAdded('fam', 'evt', 'anna');

    expect(recipients(written)).toEqual(['martin']);
  });

  it('the bell stops listing what somebody you blocked did, and keeps what nobody did', async () => {
    const { service, prisma } = build({ blocks: [{ blocker: 'anna', blocked: 'martin' }] });

    await service.listFor({ memberId: 'anna', familyId: 'fam', role: MemberRole.member, groupIds: [] });

    const where = prisma.notification.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([{ OR: [{ actorMemberId: null }, { actorMemberId: { notIn: ['martin'] } }] }]);
  });

  it('with nobody blocked the bell asks nothing about actors', async () => {
    const { service, prisma } = build();

    await service.listFor({ memberId: 'anna', familyId: 'fam', role: MemberRole.member, groupIds: [] });

    expect(prisma.notification.findMany.mock.calls[0][0].where.AND).toBeUndefined();
  });
});

describe('Somebody joining', () => {
  it('tells the admins, who sent the invitation', async () => {
    const { service, written, prisma } = build({
      members: [{ id: 'anna', role: MemberRole.admin }],
    });

    await service.memberJoined('fam', 'vera');

    const where = prisma.member.findMany.mock.calls[0][0].where;
    expect(where.role).toBe(MemberRole.admin);
    expect(where.id).toEqual({ not: 'vera' });
    expect(recipients(written)).toEqual(['anna']);
  });
});

describe('A report', () => {
  it('tells the admins who can see the entry - not the reporter, not its author - and names nobody', async () => {
    const { service, written } = build({
      members: [
        { id: 'anna', role: MemberRole.admin },
        { id: 'martin', role: MemberRole.admin },
        { id: 'vera', role: MemberRole.admin },
        { id: 'lauma', role: MemberRole.admin },
        { id: 'robert' },
      ],
      // Lauma is an admin the entry is not shown to: the bell must not tell her it exists.
      canSee: ['anna', 'martin', 'vera', 'robert'],
    });

    await service.contentReported('fam', 'evt', 'martin', 'vera');

    expect(recipients(written)).toEqual(['anna']);
    expect(written[0]).toEqual({ familyId: 'fam', memberId: 'anna', kind: 'content_reported', eventId: 'evt' });
  });

  it('answers to no settings switch: dealing with reports is the admins job', async () => {
    const { service, written, prisma } = build({
      members: [{ id: 'anna', role: MemberRole.admin, off: ['notifyEvents', 'notifyComments'] }],
      canSee: ['anna'],
    });

    await service.contentReported('fam', 'evt', 'martin', 'vera');

    expect(prisma.member.findMany.mock.calls[1][0].where.user).toBeUndefined();
    expect(recipients(written)).toEqual(['anna']);
  });
});

describe('Reminders', () => {
  const soon = new Date();
  const HOUR = 60 * 60 * 1000;
  const due = (overrides: Record<string, unknown> = {}) => ({
    id: 'rem',
    eventId: 'evt',
    minutesBefore: 60,
    scheduledFor: new Date(soon.getTime() - HOUR),
    event: { familyId: 'fam', authorMemberId: 'anna', startsAt: soon, repeat: null },
    targets: [],
    ...overrides,
  });

  it('go to the author when nobody else was named', async () => {
    const { service, written } = build({
      members: [{ id: 'anna' }],
      canSee: ['anna'],
      reminders: [due()],
    });

    expect(await service.deliverDueReminders(new Date())).toBe(1);
    expect(recipients(written)).toEqual(['anna']);
  });

  it('go to their targets when there are some', async () => {
    const { service, written } = build({
      members: [{ id: 'martin' }, { id: 'vera' }],
      canSee: ['martin', 'vera'],
      reminders: [due({ targets: [{ memberId: 'martin' }, { memberId: 'vera' }] })],
    });

    await service.deliverDueReminders(new Date());

    expect(recipients(written)).toEqual(['martin', 'vera']);
  });

  it('are claimed before they are sent, so two runs cannot both send one', async () => {
    const { service, written, prisma } = build({
      members: [{ id: 'anna' }],
      canSee: ['anna'],
      reminders: [due()],
      claimed: 0,
    });

    await service.deliverDueReminders(new Date());

    expect(prisma.reminder.updateMany.mock.calls[0][0].where).toEqual({ id: 'rem', deliveredAt: null });
    expect(written).toHaveLength(0);
  });

  it('are dropped, not delivered, when they come far too late', async () => {
    const longAgo = new Date(Date.now() - 24 * HOUR);
    const { service, written, prisma } = build({
      members: [{ id: 'anna' }],
      canSee: ['anna'],
      reminders: [
        due({
          scheduledFor: new Date(longAgo.getTime() - HOUR),
          event: { familyId: 'fam', authorMemberId: 'anna', startsAt: longAgo, repeat: null },
        }),
      ],
    });

    await service.deliverDueReminders(new Date());

    // Claimed, so it is never retried - and silent, because "in one hour"
    // about yesterday's appointment is worse than nothing.
    expect(prisma.reminder.updateMany).toHaveBeenCalled();
    expect(written).toHaveLength(0);
  });

  describe('for a repeating event', () => {
    // Weekly, Tuesdays 18:00 in Riga, since October 2026.
    const series = {
      familyId: 'fam',
      authorMemberId: 'anna',
      startsAt: new Date('2026-10-20T15:00:00.000Z'),
      endsAt: null,
      repeat: 'weekly',
      repeatUntil: null,
      repeatSkips: [],
      repeatTimeZone: 'Europe/Riga',
    };

    it('walk on to the next occurrence once this one is sent', async () => {
      const now = new Date('2026-10-27T15:00:30.000Z');
      const { service, written, prisma } = build({
        members: [{ id: 'anna' }],
        canSee: ['anna'],
        reminders: [due({ scheduledFor: new Date('2026-10-27T15:00:00.000Z'), event: series })],
      });

      await service.deliverDueReminders(now);

      expect(recipients(written)).toEqual(['anna']);
      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'rem' },
        data: { scheduledFor: new Date('2026-11-03T15:00:00.000Z'), deliveredAt: null },
      });
    });

    it('are judged late by the occurrence, not by when the series began', async () => {
      // The series began a week earlier. Measured from that, every reminder
      // after the first would be "a week late" and dropped.
      const now = new Date('2026-10-27T15:00:30.000Z');
      const { service, written } = build({
        members: [{ id: 'anna' }],
        canSee: ['anna'],
        reminders: [due({ scheduledFor: new Date('2026-10-27T15:00:00.000Z'), event: series })],
      });

      await service.deliverDueReminders(now);
      expect(written).toHaveLength(1);
    });

    it('skip the weeks a sleeping laptop missed instead of sending them all', async () => {
      // Due for the 20th, found on the 29th.
      const now = new Date('2026-10-29T08:00:00.000Z');
      const { service, written, prisma } = build({
        members: [{ id: 'anna' }],
        canSee: ['anna'],
        reminders: [due({ scheduledFor: new Date('2026-10-20T14:00:00.000Z'), event: series })],
      });

      await service.deliverDueReminders(now);

      expect(written).toHaveLength(0);
      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'rem' },
        data: { scheduledFor: new Date('2026-11-03T15:00:00.000Z'), deliveredAt: null },
      });
    });
  });

  it('skip a target who turned reminders off', async () => {
    const { service, written } = build({
      members: [{ id: 'martin' }, { id: 'vera', off: ['notifyReminders'] }],
      canSee: ['martin', 'vera'],
      reminders: [due({ targets: [{ memberId: 'martin' }, { memberId: 'vera' }] })],
    });

    await service.deliverDueReminders(new Date());

    expect(recipients(written)).toEqual(['martin']);
  });

  it('skip a target who can no longer see the event', async () => {
    const { service, written } = build({
      members: [{ id: 'martin' }, { id: 'vera' }],
      canSee: ['martin'],
      reminders: [due({ targets: [{ memberId: 'martin' }, { memberId: 'vera' }] })],
    });

    await service.deliverDueReminders(new Date());

    expect(recipients(written)).toEqual(['martin']);
  });
});

describe('Reading the bell', () => {
  const ctx: ViewerContext = { memberId: 'vera', familyId: 'fam', role: MemberRole.viewer, groupIds: [] };

  it('filters by visibility again, not only when it was written', async () => {
    const { service, prisma } = build();

    await service.listFor(ctx);

    const where = prisma.notification.findMany.mock.calls[0][0].where;
    expect(where.memberId).toBe('vera');
    // An event made private after the fact disappears from the bell as it
    // disappears from the timeline.
    expect(where.OR).toContainEqual({ eventId: null });
    expect(JSON.stringify(where.OR)).toContain('"viewer":"vera"');
  });

  it('marks as read only what belongs to the reader', async () => {
    const { service, prisma } = build();

    await service.markRead(ctx, 'ntf_1');

    expect(prisma.notification.updateMany.mock.calls[0][0].where).toMatchObject({
      id: 'ntf_1',
      memberId: 'vera',
    });
  });
});

describe('Capsules and surprises', () => {
  function withDue(rows: unknown[], options: Parameters<typeof build>[0] = {}) {
    const built = build(options);
    const event = built.prisma.event as Record<string, unknown>;
    event.findMany = jest.fn().mockResolvedValue(rows);
    event.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    return built;
  }

  it('an opened capsule reaches everybody who can see it, but its author', async () => {
    const { service, written } = withDue(
      [{ id: 'evt', familyId: 'fam', authorMemberId: 'anna', sealedUntil: new Date(), hiddenFromMemberId: null }],
      { members: [{ id: 'anna' }, { id: 'martin' }, { id: 'vera' }], canSee: ['anna', 'martin', 'vera'] },
    );

    expect(await service.deliverUnlocks(new Date())).toBe(2);
    expect(recipients(written)).toEqual(['martin', 'vera']);
    expect(written.every((w) => w.kind === 'capsule_opened')).toBe(true);
  });

  it('a surprise tells its person once, however many wished them well', async () => {
    const wish = (id: string, author: string) => ({
      id,
      familyId: 'fam',
      authorMemberId: author,
      sealedUntil: null,
      hiddenFromMemberId: 'vera',
    });
    const { service, written } = withDue([wish('w1', 'anna'), wish('w2', 'martin'), wish('w3', 'emily')], {
      members: [{ id: 'anna' }, { id: 'martin' }, { id: 'vera' }],
      canSee: ['anna', 'martin', 'vera'],
    });

    await service.deliverUnlocks(new Date());
    expect(written).toEqual([expect.objectContaining({ memberId: 'vera', kind: 'surprise_ready' })]);
  });

  it('is claimed before it is said, so two runs cannot both say it', async () => {
    const { service, written, prisma } = withDue(
      [{ id: 'evt', familyId: 'fam', authorMemberId: 'anna', sealedUntil: new Date(), hiddenFromMemberId: null }],
      { members: [{ id: 'martin' }], canSee: ['martin'] },
    );
    (prisma.event as unknown as { updateMany: jest.Mock }).updateMany.mockResolvedValue({ count: 0 });

    await service.deliverUnlocks(new Date());
    expect(written).toHaveLength(0);
  });
});

describe('Special days', () => {
  function withFamily() {
    const built = build();
    (built.prisma.member as unknown as { findMany: jest.Mock }).findMany = jest.fn().mockResolvedValue([
      { id: 'anna', familyId: 'fam' },
      { id: 'martin', familyId: 'fam' },
    ]);
    return built;
  }

  // 10:00 in Riga (UTC+3 in May) on Thursday 7 May 2026: Mother's Day is on
  // Sunday the 10th.
  const THREE_DAYS_BEFORE_MOTHERS_DAY = new Date('2026-05-07T07:00:00.000Z');

  it("tells everybody who wants reminders, three days before Mother's Day", async () => {
    const { service, prisma, written } = withFamily();

    expect(await service.deliverSpecialDays(THREE_DAYS_BEFORE_MOTHERS_DAY)).toBe(2);

    expect(recipients(written)).toEqual(['anna', 'martin']);
    expect(written[0]).toMatchObject({
      kind: 'special_day',
      dayKey: 'mothers-day',
      dayOn: new Date('2026-05-10T12:00:00.000Z'),
    });
    const findMany = (prisma.member as unknown as { findMany: jest.Mock }).findMany;
    // Only people who can sign in, want reminders, are no child profile and are alive.
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      userId: { not: null },
      role: { not: MemberRole.child },
      diedOn: null,
      user: { notifyReminders: true },
    });
    // However often it is asked, the (member, day) key keeps it to once.
    const createMany = (prisma.notification as unknown as { createMany: jest.Mock }).createMany;
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('says it once a day, however often the worker asks', async () => {
    const { service, written } = withFamily();

    await service.deliverSpecialDays(THREE_DAYS_BEFORE_MOTHERS_DAY);
    await service.deliverSpecialDays(new Date('2026-05-07T09:30:00.000Z'));

    expect(written).toHaveLength(2);
  });

  it('wakes nobody: not before nine in the morning there', async () => {
    const { service, prisma } = withFamily();

    expect(await service.deliverSpecialDays(new Date('2026-05-07T05:00:00.000Z'))).toBe(0);
    expect((prisma.member as unknown as { findMany: jest.Mock }).findMany).not.toHaveBeenCalled();
  });

  it('an ordinary day says nothing, and does not even ask who to tell', async () => {
    const { service, prisma } = withFamily();

    expect(await service.deliverSpecialDays(new Date('2026-05-08T07:00:00.000Z'))).toBe(0);
    expect((prisma.member as unknown as { findMany: jest.Mock }).findMany).not.toHaveBeenCalled();
  });
});
