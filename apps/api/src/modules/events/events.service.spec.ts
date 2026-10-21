import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MemberRole, VisibilityKind } from '@prisma/client';

import type { AuditService } from '../../common/audit.service';
import type { PrismaService } from '../../common/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';
import { EventsService, repeatData } from './events.service';

/**
 * Events service tests.
 *
 * Two things matter more than the rest here:
 *   1. The server applies the safe visibility default itself — the client is
 *      not trusted, because an API call can come from anywhere.
 *   2. The visibility rows are built correctly. A mistake here means an event
 *      that belongs to "groups" but has no group rows — invisible in practice
 *      to everyone, including the people it was meant for.
 */

function ctx(role: MemberRole = MemberRole.member): ViewerContext {
  return { memberId: 'mem_me', familyId: 'fam_1', role, groupIds: ['grp_parents'] };
}

/** Every id exists in the family except the ones that say they are from elsewhere. */
function inFamily({ where }: { where: { id: { in: string[] } } }) {
  return Promise.resolve(
    where.id.in.filter((id) => !id.startsWith('foreign_')).map((id) => ({ id })),
  );
}

function build(
  options: {
    eventCount?: number;
    plan?: 'free' | 'premium';
    premiumUntil?: Date;
    childCount?: number;
    healthConsent?: boolean;
  } = {},
) {
  const prisma = {
    event: {
      count: jest.fn().mockResolvedValue(options.eventCount ?? 0),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'evt_new', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 'evt_1' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'evt_1',
        authorMemberId: 'mem_me',
        visibilityKind: VisibilityKind.family,
        participants: [],
      }),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'evt_1', ...data })),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(
        options.plan === 'premium'
          ? { plan: 'premium', status: 'active', currentPeriodEnd: options.premiumUntil ?? null }
          : null,
      ),
    },
    member: {
      count: jest.fn().mockResolvedValue(options.childCount ?? 0),
      findMany: jest.fn().mockImplementation(inFamily),
      findUnique: jest.fn().mockResolvedValue({
        user: { healthConsentAt: options.healthConsent ? new Date('2026-10-01T00:00:00.000Z') : null },
      }),
    },
    group: {
      findFirst: jest.fn().mockResolvedValue({ id: 'grp_parents' }),
      findMany: jest.fn().mockImplementation(inFamily),
    },
    eventVisibility: { deleteMany: jest.fn().mockResolvedValue({}) },
    eventParticipant: { deleteMany: jest.fn().mockResolvedValue({}) },
    reminder: { deleteMany: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) =>
      fn({
        eventVisibility: { deleteMany: jest.fn().mockResolvedValue({}) },
        eventParticipant: { deleteMany: jest.fn().mockResolvedValue({}) },
        reminder: { deleteMany: jest.fn().mockResolvedValue({}) },
        event: {
          update: jest.fn().mockImplementation(({ data }) =>
            Promise.resolve({ id: 'evt_1', ...data }),
          ),
        },
      }),
    ),
  };

  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const visibility = new VisibilityService(prisma as unknown as PrismaService);
  const notifications = { eventCreated: jest.fn(), commentAdded: jest.fn(), memberJoined: jest.fn() } as unknown as NotificationsService;
  const service = new EventsService(
    prisma as unknown as PrismaService,
    visibility,
    audit,
    notifications,
  );

  return { service, prisma, visibility, audit, notifications };
}

const baseInput = {
  title: 'Notikums',
  startsAt: '2026-09-01T08:00:00.000Z',
  categoryId: 'education',
};

// ---------------------------------------------------------------------------

describe('Building the visibility rows', () => {
  it('family creates no rows — the common case stays cheap', async () => {
    const { service, prisma } = build();
    await service.create(ctx(), { ...baseInput, visibility: { kind: 'family' } });

    const data = prisma.event.create.mock.calls[0][0].data;
    expect(data.visibilityKind).toBe(VisibilityKind.family);
    expect(data.visibility.create).toEqual([]);
  });

  it('private creates no rows either', async () => {
    const { service, prisma } = build();
    await service.create(ctx(), { ...baseInput, visibility: { kind: 'private' } });
    expect(prisma.event.create.mock.calls[0][0].data.visibility.create).toEqual([]);
  });

  it('groups creates one row per group', async () => {
    const { service, prisma } = build();
    await service.create(ctx(), {
      ...baseInput,
      visibility: { kind: 'groups', groupIds: ['grp_a', 'grp_b'] },
    });

    expect(prisma.event.create.mock.calls[0][0].data.visibility.create).toEqual([
      { groupId: 'grp_a' },
      { groupId: 'grp_b' },
    ]);
  });

  it('members creates one row per member', async () => {
    const { service, prisma } = build();
    await service.create(ctx(), {
      ...baseInput,
      visibility: { kind: 'members', memberIds: ['mem_vija'] },
    });

    expect(prisma.event.create.mock.calls[0][0].data.visibility.create).toEqual([
      { memberId: 'mem_vija' },
    ]);
  });

  it('custom creates the group rows AND the member rows', async () => {
    // The composer's "groups and people" audience. This used to write no rows
    // at all, so the event reached nobody but its author.
    const { service, prisma } = build();
    await service.create(ctx(), {
      ...baseInput,
      visibility: { kind: 'custom', groupIds: ['grp_grandparents'], memberIds: ['mem_vija'] },
    });

    const data = prisma.event.create.mock.calls[0][0].data;
    expect(data.visibilityKind).toBe(VisibilityKind.custom);
    expect(data.visibility.create).toEqual([
      { groupId: 'grp_grandparents' },
      { memberId: 'mem_vija' },
    ]);
  });

  it('drops groups and people that are not in this family', async () => {
    const { service, prisma } = build();
    await service.create(ctx(), {
      ...baseInput,
      visibility: {
        kind: 'custom',
        groupIds: ['grp_grandparents', 'foreign_grp'],
        memberIds: ['foreign_mem', 'mem_vija'],
      },
    });

    expect(prisma.event.create.mock.calls[0][0].data.visibility.create).toEqual([
      { groupId: 'grp_grandparents' },
      { memberId: 'mem_vija' },
    ]);
  });

  it('an audience with nobody left in it is saved as private, which is what it is', async () => {
    const { service, prisma } = build();
    await service.create(ctx(), {
      ...baseInput,
      visibility: { kind: 'custom', groupIds: ['foreign_grp'], memberIds: [] },
    });

    const data = prisma.event.create.mock.calls[0][0].data;
    expect(data.visibilityKind).toBe(VisibilityKind.private);
    expect(data.visibility.create).toEqual([]);
  });

  it('changing to a custom audience writes both lists too', async () => {
    const { service, prisma } = build();
    const txUpdate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'evt_1', ...data }));
    prisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) =>
      fn({ eventVisibility: { deleteMany: jest.fn() }, event: { update: txUpdate } }),
    );

    await service.changeVisibility(ctx(), 'evt_1', {
      kind: VisibilityKind.custom,
      groupIds: ['grp_parents'],
      memberIds: ['mem_vija'],
    });

    expect(txUpdate.mock.calls[0][0].data.visibility.create).toEqual([
      { groupId: 'grp_parents' },
      { memberId: 'mem_vija' },
    ]);
  });
});

describe('The safe default on the server', () => {
  it('no visibility given and no child — the whole family', async () => {
    const { service, prisma } = build({ childCount: 0 });
    await service.create(ctx(), { ...baseInput, participantMemberIds: ['mem_adult'] });

    expect(prisma.event.create.mock.calls[0][0].data.visibilityKind).toBe(VisibilityKind.family);
  });

  it('no visibility given but a child among participants — Parents only', async () => {
    const { service, prisma } = build({ childCount: 1 });
    await service.create(ctx(), { ...baseInput, participantMemberIds: ['mem_child'] });

    const data = prisma.event.create.mock.calls[0][0].data;
    expect(data.visibilityKind).toBe(VisibilityKind.groups);
    expect(data.visibility.create).toEqual([{ groupId: 'grp_parents' }]);
  });

  it('a visibility the client did send is not overwritten', async () => {
    const { service, prisma } = build({ childCount: 1 });
    await service.create(ctx(), {
      ...baseInput,
      participantMemberIds: ['mem_child'],
      visibility: { kind: 'family' },
    });

    // If the user deliberately chose the whole family, the server respects it.
    expect(prisma.event.create.mock.calls[0][0].data.visibilityKind).toBe(VisibilityKind.family);
  });

  it('with no participants the database is not even asked about children', async () => {
    const { service, prisma } = build();
    await service.create(ctx(), baseInput);
    expect(prisma.member.count).not.toHaveBeenCalled();
  });
});

describe('Plan limits', () => {
  it('the free plan blocks at 50 events', async () => {
    const { service } = build({ eventCount: 50 });
    await expect(service.create(ctx(), baseInput)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('49 events are still allowed', async () => {
    const { service } = build({ eventCount: 49 });
    await expect(service.create(ctx(), baseInput)).resolves.toBeDefined();
  });

  it('the premium plan has no limit', async () => {
    const { service } = build({ eventCount: 5000, plan: 'premium' });
    await expect(service.create(ctx(), baseInput)).resolves.toBeDefined();
  });

  it('a premium period that has ended is the free plan, before any webhook says so', async () => {
    const { service } = build({ eventCount: 50, plan: 'premium', premiumUntil: new Date(Date.now() - 60_000) });
    await expect(service.create(ctx(), baseInput)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the error code lets the UI open the paywall without comparing text', async () => {
    const { service } = build({ eventCount: 50 });
    await service.create(ctx(), baseInput).catch((error: ForbiddenException) => {
      expect((error.getResponse() as { code: string }).code).toBe('plan_limit_reached');
    });
    expect.assertions(1);
  });
});

describe('Health entries (GDPR Art. 9)', () => {
  const health = { ...baseInput, categoryId: 'health' };
  const refused = (error: ForbiddenException) => (error.getResponse() as { code: string }).code;

  it("are refused without the author's consent, with a code the app can act on", async () => {
    const { service, prisma } = build();
    await service.create(ctx(), health).catch((error: ForbiddenException) => {
      expect(refused(error)).toBe('health_consent_required');
    });
    expect(prisma.event.create).not.toHaveBeenCalled();
    expect.assertions(2);
  });

  it('are written once the author has consented', async () => {
    const { service } = build({ healthConsent: true });
    await expect(service.create(ctx(), health)).resolves.toMatchObject({ categoryId: 'health' });
  });

  it('other categories never ask', async () => {
    const { service, prisma } = build();
    await expect(service.create(ctx(), baseInput)).resolves.toBeDefined();
    expect(prisma.member.findUnique).not.toHaveBeenCalled();
  });

  it('moving an entry into Health asks; editing one already there does not', async () => {
    const { service, prisma } = build();
    prisma.event.findUniqueOrThrow.mockResolvedValue({
      authorMemberId: 'mem_me',
      categoryId: 'education',
      startsAt: new Date('2026-09-01T08:00:00.000Z'),
      visibilityKind: VisibilityKind.family,
    });
    await expect(service.update(ctx(), 'evt_1', { categoryId: 'health' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    prisma.event.findUniqueOrThrow.mockResolvedValue({
      authorMemberId: 'mem_me',
      categoryId: 'health',
      startsAt: new Date('2026-09-01T08:00:00.000Z'),
      visibilityKind: VisibilityKind.family,
    });
    await expect(service.update(ctx(), 'evt_1', { categoryId: 'health', title: 'New' })).resolves.toBeDefined();
  });
});

describe('What an event is made of', () => {
  it('a category the app cannot draw is refused, and nothing is written', async () => {
    const { service, prisma } = build();
    await expect(service.create(ctx(), { ...baseInput, categoryId: 'gardening' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  it('a blank title is refused; a title is trimmed', async () => {
    const { service, prisma } = build();
    await expect(service.create(ctx(), { ...baseInput, title: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    await service.create(ctx(), { ...baseInput, title: '  Jāņi  ' });
    expect(prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'Jāņi' }) }),
    );
  });

  it('a start that is not a date is a 400, not a 500 from the database', async () => {
    const { service } = build();
    await expect(service.create(ctx(), { ...baseInput, startsAt: 'soon' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('Role capabilities', () => {
  it('a viewer cannot create an event', async () => {
    const { service } = build();
    await expect(service.create(ctx(MemberRole.viewer), baseInput)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('a child cannot create an event', async () => {
    const { service } = build();
    await expect(service.create(ctx(MemberRole.child), baseInput)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('the limit check is skipped when the role already refuses — no wasted query', async () => {
    const { service, prisma } = build();
    await service.create(ctx(MemberRole.viewer), baseInput).catch(() => undefined);
    expect(prisma.event.count).not.toHaveBeenCalled();
  });
});

describe('Changing visibility', () => {
  it('an ordinary member does not change someone else\'s event', async () => {
    const { service, prisma } = build();
    prisma.event.findUniqueOrThrow.mockResolvedValue({
      authorMemberId: 'mem_other',
      visibilityKind: VisibilityKind.family,
    });

    await expect(
      service.changeVisibility(ctx(MemberRole.member), 'evt_1', { kind: VisibilityKind.private }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an administrator changes anybody\'s', async () => {
    const { service, prisma } = build();
    prisma.event.findUniqueOrThrow.mockResolvedValue({
      authorMemberId: 'mem_other',
      visibilityKind: VisibilityKind.family,
    });

    await expect(
      service.changeVisibility(ctx(MemberRole.admin), 'evt_1', { kind: VisibilityKind.private }),
    ).resolves.toBeDefined();
  });

  it('the change always reaches the audit log with the old and the new value', async () => {
    const { service, audit } = build();
    await service.changeVisibility(ctx(), 'evt_1', { kind: VisibilityKind.private });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'event.visibility_changed',
        metadata: { from: VisibilityKind.family, to: VisibilityKind.private },
      }),
    );
  });
});

describe('List filters', () => {
  it('the visibility filter is part of the where, not post-processing', async () => {
    const { service, prisma } = build();
    await service.list(ctx(), {});

    const where = prisma.event.findMany.mock.calls[0][0].where;
    expect(Array.isArray(where.AND)).toBe(true);
    expect(where.AND[0]).toHaveProperty('OR');
  });

  it('the page limit never exceeds 50, even when more is requested', async () => {
    const { service, prisma } = build();
    await service.list(ctx(), { limit: 500 });
    expect(prisma.event.findMany.mock.calls[0][0].take).toBe(51);
  });

  it('search is case-insensitive', async () => {
    const { service, prisma } = build();
    await service.list(ctx(), { q: 'Skola' });

    const where = prisma.event.findMany.mock.calls[0][0].where;
    const search = where.AND.find((f: Record<string, unknown>) => 'OR' in f && !('familyId' in f));
    expect(JSON.stringify(search)).toContain('insensitive');
  });
});


// ---------------------------------------------------------------------------

describe('Editing an event', () => {
  it('an ordinary member does not edit someone else\'s', async () => {
    const { service, prisma } = build();
    prisma.event.findUniqueOrThrow.mockResolvedValue({
      authorMemberId: 'mem_other',
      startsAt: new Date('2026-09-01T08:00:00.000Z'),
      visibilityKind: VisibilityKind.family,
    });

    await expect(service.update(ctx(), 'evt_1', { title: 'New' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('the author edits their own', async () => {
    const { service } = build();
    const updated = await service.update(ctx(), 'evt_1', { title: 'New' });
    expect(updated).toMatchObject({ title: 'New' });
  });

  it('leaves out what the caller did not send', async () => {
    // A PATCH that silently blanked the description would lose what a family
    // wrote, and `undefined` and `null` mean different things here.
    const { service } = build();
    const updated = (await service.update(ctx(), 'evt_1', { title: 'New' })) as Record<
      string,
      unknown
    >;
    expect(updated).not.toHaveProperty('description');
    expect(updated).not.toHaveProperty('categoryId');
  });

  it('cannot widen visibility — that path is changeVisibility, which audits', async () => {
    const { service, audit } = build();
    const dto = { title: 'New', visibility: { kind: VisibilityKind.family } } as never;
    const updated = (await service.update(ctx(), 'evt_1', dto)) as Record<string, unknown>;
    expect(updated).not.toHaveProperty('visibilityKind');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('narrows a family event when a child joins the participants', async () => {
    // The client already does this. The client is not the boundary.
    const { service, audit } = build({ childCount: 1 });
    await service.update(ctx(), 'evt_1', { participantMemberIds: ['mem_child'] });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'event.visibility_changed' }),
    );
  });

  it('leaves visibility alone when no child is involved', async () => {
    const { service, audit } = build({ childCount: 0 });
    await service.update(ctx(), 'evt_1', { participantMemberIds: ['mem_martin'] });
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('Repeating events', () => {
  it('keeps the rule, the end and the zone on the one row', async () => {
    const { service, prisma } = build();
    await service.create(ctx(), {
      ...baseInput,
      repeat: 'weekly',
      repeatUntil: '2026-12-22T12:00:00.000Z',
      repeatTimeZone: 'Europe/Riga',
    });

    const data = prisma.event.create.mock.calls[0][0].data;
    expect(data.repeat).toBe('weekly');
    expect(data.repeatUntil).toEqual(new Date('2026-12-22T12:00:00.000Z'));
    expect(data.repeatTimeZone).toBe('Europe/Riga');
  });

  it('refuses a rule it does not know rather than saving a one-off', async () => {
    const { service } = build();
    await expect(
      service.create(ctx(), { ...baseInput, repeat: 'fortnightly' as never }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('keeps a zone it does not know out of the row', async () => {
    const { service, prisma } = build();
    await service.create(ctx(), { ...baseInput, repeat: 'daily', repeatTimeZone: 'Mars/Base' });
    expect(prisma.event.create.mock.calls[0][0].data.repeatTimeZone).toBeNull();
  });

  it('reminds of the next occurrence still ahead when the series began earlier', async () => {
    // Started a year ago, weekly: the reminder is for the coming week, not for
    // the first practice - which the worker would drop as a year late.
    const { service, prisma } = build();
    const started = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    await service.create(ctx(), {
      ...baseInput,
      startsAt: started.toISOString(),
      repeat: 'weekly',
      reminder: { minutesBefore: 60 },
    });

    const scheduled = prisma.event.create.mock.calls[0][0].data.reminders.create.scheduledFor as Date;
    expect(scheduled.getTime()).toBeGreaterThan(Date.now());
    expect(scheduled.getTime()).toBeLessThan(Date.now() + 8 * 24 * 60 * 60 * 1000);
  });

  it('skips arrive as days, and anything else in the list is dropped', () => {
    expect(repeatData({ repeatSkips: ['2026-10-27', 'next tuesday', 42, '2026-10-27'] })).toEqual({
      repeatSkips: ['2026-10-27'],
    });
  });

  it('says nothing about repeating when the caller said nothing', () => {
    expect(repeatData({})).toEqual({});
  });
});

describe('Moving an event', () => {
  it('moves its reminder with it', async () => {
    // Moving the dentist to Friday used to leave the reminder on Wednesday.
    const { service, prisma } = build();
    const reminderUpdate = jest.fn().mockResolvedValue({});
    prisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) =>
      fn({
        eventParticipant: { deleteMany: jest.fn() },
        reminder: {
          deleteMany: jest.fn(),
          findMany: jest.fn().mockResolvedValue([{ id: 'rem_1', minutesBefore: 60 }]),
          update: reminderUpdate,
        },
        event: {
          update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'evt_1', ...data })),
        },
      }),
    );

    await service.update(ctx(), 'evt_1', { startsAt: '2030-05-10T09:00:00.000Z' });

    expect(reminderUpdate).toHaveBeenCalledWith({
      where: { id: 'rem_1' },
      data: { scheduledFor: new Date('2030-05-10T08:00:00.000Z'), deliveredAt: null },
    });
  });
});

describe('Deleting an event', () => {
  it('is soft, so undo can bring it back unchanged', async () => {
    const { service, prisma } = build();
    await service.remove(ctx(), 'evt_1');

    const call = prisma.event.update.mock.calls[0][0] as { data: { deletedAt: Date } };
    expect(call.data.deletedAt).toBeInstanceOf(Date);
  });

  it('always reaches the audit log', async () => {
    const { service, audit } = build();
    await service.remove(ctx(), 'evt_1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'event.deleted', entityId: 'evt_1' }),
    );
  });

  it('a viewer cannot delete, even something they can see', async () => {
    const { service } = build();
    await expect(service.remove(ctx(MemberRole.viewer), 'evt_1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('a member cannot delete someone else\'s', async () => {
    const { service, prisma } = build();
    prisma.event.findUniqueOrThrow.mockResolvedValue({ authorMemberId: 'mem_other' });

    await expect(service.remove(ctx(), 'evt_1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an administrator deletes any of them', async () => {
    const { service, prisma } = build();
    prisma.event.findUniqueOrThrow.mockResolvedValue({ authorMemberId: 'mem_other' });

    await expect(service.remove(ctx(MemberRole.admin), 'evt_1')).resolves.toBeUndefined();
  });
});

describe('Undoing a delete', () => {
  it('finds the event through deletedAt, because it is invisible by then', async () => {
    const { service, prisma } = build();
    prisma.event.findFirst.mockResolvedValue({ authorMemberId: 'mem_me' });

    await service.restore(ctx(), 'evt_1');

    const where = prisma.event.findFirst.mock.calls[0][0].where as Record<string, unknown>;
    expect(where).toMatchObject({ id: 'evt_1', familyId: 'fam_1' });
    expect(where.deletedAt).toEqual({ not: null });
  });

  it('clears the timestamp rather than writing a new row', async () => {
    const { service, prisma } = build();
    prisma.event.findFirst.mockResolvedValue({ authorMemberId: 'mem_me' });

    await service.restore(ctx(), 'evt_1');

    const call = prisma.event.update.mock.calls[0][0] as {
      where: { id: string };
      data: { deletedAt: null };
    };
    // The same id: a new one would orphan every reaction and reminder.
    expect(call.where.id).toBe('evt_1');
    expect(call.data.deletedAt).toBeNull();
  });

  it('an id that was never deleted is a 404, not a silent success', async () => {
    const { service, prisma } = build();
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(service.restore(ctx(), 'evt_1')).rejects.toMatchObject({ status: 404 });
  });
});

describe('Time capsules', () => {
  const later = () => new Date(Date.now() + 5 * 365 * 86_400_000).toISOString();

  it('opens on a date ahead: one in the past is refused', async () => {
    const { service } = build();
    await expect(
      service.create(ctx(), { ...baseInput, sealedUntil: '2020-01-01T00:00:00.000Z' }),
    ).rejects.toMatchObject({ response: { code: 'invalid_seal' } });
  });

  it('is sealed when it is made', async () => {
    const { service, prisma } = build();
    const until = later();
    await service.create(ctx(), { ...baseInput, sealedUntil: until });
    expect(prisma.event.create.mock.calls[0][0].data.sealedUntil).toEqual(new Date(until));
  });

  it('goes back to anybody but its author as an envelope, with nothing inside', async () => {
    const { service, prisma } = build();
    prisma.event.findUniqueOrThrow.mockResolvedValue({
      id: 'evt_1',
      title: 'For Robert, at 18',
      description: 'What we hope for you.',
      authorMemberId: 'mem_anna',
      sealedUntil: new Date(Date.now() + 86_400_000),
      tags: ['letter'],
      attachments: [{ id: 'att_1' }],
      reactions: [{ memberId: 'mem_x', kind: 'heart' }],
      reminders: [],
      participants: [],
      _count: { comments: 3 },
    });

    const envelope = await service.findOne(ctx(), 'evt_1');
    expect(envelope).toMatchObject({
      title: 'For Robert, at 18',
      sealed: true,
      description: null,
      tags: [],
      attachments: [],
      reactions: [],
      _count: { comments: 0 },
    });

    const own = await service.findOne({ ...ctx(), memberId: 'mem_anna' }, 'evt_1');
    expect(own).toMatchObject({ sealed: false, description: 'What we hope for you.' });
  });

  it('nobody but its author edits one still closed to them - not even an admin', async () => {
    const { service, prisma } = build();
    prisma.event.findUniqueOrThrow.mockResolvedValue({
      id: 'evt_1',
      authorMemberId: 'mem_anna',
      visibilityKind: VisibilityKind.family,
      sealedUntil: new Date(Date.now() + 86_400_000),
      participants: [],
    });
    await expect(
      service.update(ctx(MemberRole.admin), 'evt_1', { title: 'Opened' }),
    ).rejects.toMatchObject({ response: { code: 'capsule_sealed' } });
  });
});

describe('Surprises', () => {
  const soon = () => new Date(Date.now() + 5 * 86_400_000).toISOString();

  it('are for somebody in the family, and not for oneself', async () => {
    const { service, prisma } = build();
    (prisma.member as Record<string, unknown>).findFirst = jest.fn().mockResolvedValue(null);

    await expect(
      service.create(ctx(), { ...baseInput, surpriseFor: 'mem_me', revealAt: soon() }),
    ).rejects.toMatchObject({ response: { code: 'invalid_surprise' } });
    await expect(
      service.create(ctx(), { ...baseInput, surpriseFor: 'mem_stranger', revealAt: soon() }),
    ).rejects.toMatchObject({ response: { code: 'invalid_surprise' } });
  });

  it('need a moment ahead to be revealed at, within a year and a bit', async () => {
    const { service } = build();
    await expect(
      service.create(ctx(), { ...baseInput, surpriseFor: 'mem_vera', revealAt: '2020-01-01T00:00:00.000Z' }),
    ).rejects.toMatchObject({ response: { code: 'invalid_surprise' } });
    await expect(
      service.create(ctx(), { ...baseInput, surpriseFor: 'mem_vera' }),
    ).rejects.toMatchObject({ response: { code: 'invalid_surprise' } });
  });

  it('are written with who they are kept from and when', async () => {
    const { service, prisma } = build();
    (prisma.member as Record<string, unknown>).findFirst = jest.fn().mockResolvedValue({ id: 'mem_vera' });
    const at = soon();

    await service.create(ctx(), { ...baseInput, surpriseFor: 'mem_vera', revealAt: at });
    expect(prisma.event.create.mock.calls[0][0].data).toMatchObject({
      hiddenFromMemberId: 'mem_vera',
      revealAt: new Date(at),
    });
  });
});

describe('The story shelf', () => {
  it('is asked for on its own, and only an explicit yes turns it on', async () => {
    const { service, prisma } = build();
    await service.list(ctx(), { onStoryShelf: 'true' });
    await service.list(ctx(), { onStoryShelf: 'false' });
    const [first, second] = prisma.event.findMany.mock.calls.map((c) => JSON.stringify(c[0].where));
    expect(first).toContain('"onStoryShelf":true');
    expect(second).not.toContain('onStoryShelf');
  });

  it('search cannot find words inside a capsule the reader may not open', async () => {
    const { service, prisma } = build();
    await service.list(ctx(), { q: 'secret' });
    const where = JSON.stringify(prisma.event.findMany.mock.calls[0][0].where);
    expect(where).toContain('"sealedUntil":null');
    expect(where).toContain('"authorMemberId":"mem_me"');
  });
});
