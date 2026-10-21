import { InsightKind, InsightSource, MemberRole } from '@prisma/client';

import type { PrismaService } from '../../common/prisma.service';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';
import { AiService } from './ai.service';

/**
 * AI layer tests.
 *
 * The MVP AI is rule-based, and its main value is PREDICTABILITY.
 * Two requirements these tests hold:
 *
 *   1. Below 0.6 confidence nothing is suggested at all. Better silent than
 *      guessing — a user rejects one wrong suggestion and then stops looking
 *      at the next ones.
 *   2. A rule-based system never presents itself as more certain than it is.
 *      Confidence must not reach 1.0 where the answer is a guess.
 */

type Row = { id: string; participants: { memberId: string }[]; [key: string]: unknown };

function build(
  options: {
    /** One-off events the query finds overlapping. */
    overlapping?: Row[];
    /** Repeating series whose occurrences are then checked. */
    series?: Row[];
    reminders?: { minutesBefore: number }[];
  } = {},
) {
  const created: Record<string, unknown>[] = [];

  const prisma = {
    insight: {
      create: jest.fn().mockImplementation(({ data }) => {
        created.push(data);
        return Promise.resolve({ id: 'ins_1', ...data });
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    event: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(options.overlapping ?? [])
        .mockResolvedValueOnce(options.series ?? []),
    },
    reminder: { findMany: jest.fn().mockResolvedValue(options.reminders ?? []) },
  };

  const visibility = new VisibilityService(prisma as unknown as PrismaService);
  return {
    service: new AiService(prisma as unknown as PrismaService, visibility),
    prisma,
    created,
  };
}

const VIEWER: ViewerContext = {
  memberId: 'mem_vera',
  familyId: 'fam_1',
  role: MemberRole.viewer,
  groupIds: ['grp_grandparents'],
};

// ---------------------------------------------------------------------------

describe('Category suggestion', () => {
  it('recognises a celebration', async () => {
    const { service } = build();
    const result = await service.suggestCategory('fam_1', "Robert's birthday");
    expect((result?.payload as { categoryId: string }).categoryId).toBe('celebration');
  });

  it('matches stems, so plurals and possessives all hit', async () => {
    const { service } = build();
    for (const title of ['School', 'Back to school', "School's open day", 'Schools closed']) {
      const result = await service.suggestCategory('fam_1', title);
      expect((result?.payload as { categoryId: string })?.categoryId).toBe('education');
    }
  });

  it('the modifier "first" does not drown out the real signal', async () => {
    const { service } = build();
    // "First day of school" is education, not development — even though both
    // categories once held a keyword that matched it.
    const school = await service.suggestCategory('fam_1', "Emily's first day of school");
    expect((school?.payload as { categoryId: string }).categoryId).toBe('education');

    const steps = await service.suggestCategory('fam_1', "Robert's first steps");
    expect((steps?.payload as { categoryId: string }).categoryId).toBe('development');
  });

  it('ambiguous input returns a valid category, not an error', async () => {
    // "School concert" is both education and activity. Keyword matching cannot
    // resolve that, and it does not have to: the user confirms the suggestion.
    // The only requirement here is that the result is deterministic and valid.
    const { service } = build();
    const first = await service.suggestCategory('fam_1', 'School concert');
    const second = await service.suggestCategory('fam_1', 'School concert');

    const categoryOf = (r: typeof first) => (r?.payload as { categoryId: string })?.categoryId;
    expect(['education', 'activity']).toContain(categoryOf(first));
    expect(categoryOf(second)).toBe(categoryOf(first));
  });

  it('recognises health from the description', async () => {
    const { service } = build();
    const result = await service.suggestCategory('fam_1', 'Wednesday', 'Dentist appointment');
    expect((result?.payload as { categoryId: string }).categoryId).toBe('health');
  });

  it('text that is too short gives no suggestion and writes nothing', async () => {
    const { service, prisma } = build();
    expect(await service.suggestCategory('fam_1', 'ab')).toBeNull();
    expect(prisma.insight.create).not.toHaveBeenCalled();
  });

  it('text with no keywords gives no suggestion', async () => {
    const { service } = build();
    expect(await service.suggestCategory('fam_1', 'Something else entirely')).toBeNull();
  });

  it('one match is less confident than two', async () => {
    const { service } = build();
    const one = await service.suggestCategory('fam_1', 'School');
    const two = await service.suggestCategory('fam_1', 'Exam and lesson');
    expect(two!.confidence).toBeGreaterThan(one!.confidence);
  });

  it('confidence never reaches 1.0 — the rules are not certain', async () => {
    const { service } = build();
    const result = await service.suggestCategory(
      'fam_1',
      'School exam graduation nursery lesson homework',
    );
    expect(result!.confidence).toBeLessThan(1);
    expect(result!.confidence).toBeLessThanOrEqual(0.9);
  });

  it('confidence is never below the 0.6 threshold', async () => {
    const { service } = build();
    for (const title of ['School', 'Dentist', 'Trip', 'Wedding']) {
      const result = await service.suggestCategory('fam_1', title);
      if (result) expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('the suggestion is stored as rules, not llm', async () => {
    const { service, created } = build();
    await service.suggestCategory('fam_1', 'Birthday');
    expect(created[0].source).toBe(InsightSource.rules);
    expect(created[0].kind).toBe(InsightKind.category_suggestion);
  });

  it('a suggestion has an expiry — they go stale', async () => {
    const { service, created } = build();
    await service.suggestCategory('fam_1', 'Birthday');
    expect(created[0].expiresAt).toBeInstanceOf(Date);
    expect((created[0].expiresAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('the keyword list matches the app, so both sides suggest the same thing', async () => {
    // Item 11 in docs/07-IMPROVEMENTS.md: this logic is duplicated between
    // apps/mobile/src/domain/categories.ts and this service, and it HAS drifted
    // apart once. These titles are the app's own test cases; if the two lists
    // diverge again, this test is where it shows up first.
    const { service } = build();
    const expected: [string, string][] = [
      ["Emily's first day of school", 'education'],
      ["Robert's first steps", 'development'],
      ['Dentist appointment', 'health'],
      ['Summer holiday in Spain', 'travel'],
      ['Swimming practice', 'activity'],
      ['Insurance payment', 'finance'],
      ['Wedding anniversary', 'milestone'],
      ['Grocery shopping', 'chore'],
    ];

    for (const [title, categoryId] of expected) {
      const result = await service.suggestCategory('fam_1', title);
      expect((result?.payload as { categoryId: string })?.categoryId).toBe(categoryId);
    }
  });
});

describe('Schedule conflicts', () => {
  /** The part of the query that is about this event, beside the visibility filter. */
  const own = (prisma: ReturnType<typeof build>['prisma'], call = 0) =>
    prisma.event.findMany.mock.calls[call][0].where.AND[1];

  it('with no participants no conflict is looked for at all', async () => {
    const { service, prisma } = build();
    const result = await service.detectConflicts(VIEWER, {
      startsAt: new Date(),
      participantMemberIds: [],
    });

    expect(result).toBeNull();
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('looks only at what the person asking can see', async () => {
    // It used to search the whole family and return the ids it found, so a
    // parents-only appointment reached a grandparent as "something is here".
    const { service, prisma } = build();
    await service.detectConflicts(VIEWER, { startsAt: new Date(), participantMemberIds: ['mem_emily'] });

    for (const call of prisma.event.findMany.mock.calls) {
      expect(JSON.stringify(call[0].where.AND[0])).toContain('mem_vera');
    }
  });

  it('with no overlap there is no suggestion', async () => {
    const { service } = build({ overlapping: [] });
    const result = await service.detectConflicts(VIEWER, {
      startsAt: new Date(),
      participantMemberIds: ['mem_emily'],
    });
    expect(result).toBeNull();
  });

  it('on overlap confidence is 1.0 — this is logic, not a guess', async () => {
    const { service } = build({
      overlapping: [{ id: 'evt_other', participants: [{ memberId: 'mem_emily' }] }],
    });

    const result = await service.detectConflicts(VIEWER, {
      startsAt: new Date(),
      participantMemberIds: ['mem_emily'],
    });

    expect(result!.confidence).toBe(1);
    expect(result!.kind).toBe(InsightKind.schedule_conflict);
  });

  it('says which events and which of these people are double-booked', async () => {
    const { service } = build({
      overlapping: [{ id: 'evt_a', participants: [{ memberId: 'mem_emily' }, { memberId: 'mem_anna' }] }],
    });

    const result = await service.detectConflicts(VIEWER, {
      startsAt: new Date(),
      participantMemberIds: ['mem_emily', 'mem_robert'],
    });

    expect(result!.payload).toEqual({ eventIds: ['evt_a'], memberIds: ['mem_emily'] });
  });

  it('finds a weekly practice on this week, not only on the week it began', async () => {
    // Tuesdays 18:00 in Riga since 20 October; asking about 27 October 18:15.
    const { service } = build({
      series: [
        {
          id: 'evt_practice',
          startsAt: new Date('2026-10-20T15:00:00.000Z'),
          endsAt: new Date('2026-10-20T16:30:00.000Z'),
          repeat: 'weekly',
          repeatUntil: null,
          repeatSkips: [],
          repeatTimeZone: 'Europe/Riga',
          participants: [{ memberId: 'mem_emily' }],
        },
      ],
    });

    const result = await service.detectConflicts(VIEWER, {
      startsAt: new Date('2026-10-27T16:15:00.000Z'),
      participantMemberIds: ['mem_emily'],
    });

    expect((result!.payload as { eventIds: string[] }).eventIds).toEqual(['evt_practice']);
  });

  it('a week the practice was skipped is free', async () => {
    const { service } = build({
      series: [
        {
          id: 'evt_practice',
          startsAt: new Date('2026-10-20T15:00:00.000Z'),
          endsAt: new Date('2026-10-20T16:30:00.000Z'),
          repeat: 'weekly',
          repeatUntil: null,
          repeatSkips: ['2026-10-27'],
          repeatTimeZone: 'Europe/Riga',
          participants: [{ memberId: 'mem_emily' }],
        },
      ],
    });

    const result = await service.detectConflicts(VIEWER, {
      startsAt: new Date('2026-10-27T16:15:00.000Z'),
      participantMemberIds: ['mem_emily'],
    });
    expect(result).toBeNull();
  });

  it('an event being edited does not conflict with itself', async () => {
    const { service, prisma } = build();
    await service.detectConflicts(VIEWER, {
      startsAt: new Date(),
      participantMemberIds: ['mem_emily'],
      excludeEventId: 'evt_self',
    });
    expect(own(prisma).id).toEqual({ not: 'evt_self' });
  });

  it('without endsAt an hour is assumed — an open-ended event is not infinite', async () => {
    const { service, prisma } = build();

    const start = new Date('2026-09-01T16:00:00.000Z');
    await service.detectConflicts(VIEWER, { startsAt: start, participantMemberIds: ['mem_x'] });

    const assumedEnd = (own(prisma).startsAt as { lt: Date }).lt;
    expect(assumedEnd.getTime() - start.getTime()).toBe(60 * 60 * 1000);
  });

  it('another event with no end holds its assumed hour too, from before this one starts', async () => {
    const { service, prisma } = build();

    const start = new Date('2026-09-01T16:00:00.000Z');
    await service.detectConflicts(VIEWER, { startsAt: start, participantMemberIds: ['mem_x'] });

    const openEnded = (own(prisma).OR as { endsAt: unknown; startsAt?: { gt: Date } }[]).find(
      (c) => c.endsAt === null,
    );
    expect(openEnded!.startsAt!.gt.toISOString()).toBe('2026-09-01T15:00:00.000Z');
  });

  it('all-day events are not treated as conflicts', async () => {
    const { service, prisma } = build();

    await service.detectConflicts(VIEWER, {
      startsAt: new Date(),
      participantMemberIds: ['mem_x'],
    });

    expect(own(prisma, 0).allDay).toBe(false);
    expect(own(prisma, 1).allDay).toBe(false);
  });
});

describe('Reminder time suggestion', () => {
  it('too little history gives no suggestion — better silent than guessing', async () => {
    const { service } = build({ reminders: [{ minutesBefore: 60 }, { minutesBefore: 60 }] });
    expect(await service.suggestReminderTime('fam_1', 'health')).toBeNull();
  });

  it('with a clear majority it suggests the most common time', async () => {
    const { service } = build({
      reminders: [
        { minutesBefore: 1440 },
        { minutesBefore: 1440 },
        { minutesBefore: 1440 },
        { minutesBefore: 60 },
      ],
    });

    const result = await service.suggestReminderTime('fam_1', 'celebration');
    expect((result!.payload as { minutesBefore: number }).minutesBefore).toBe(1440);
    expect(result!.confidence).toBe(0.75);
  });

  it('scattered history does not reach the threshold and gives no suggestion', async () => {
    const { service } = build({
      reminders: [
        { minutesBefore: 10 },
        { minutesBefore: 60 },
        { minutesBefore: 1440 },
        { minutesBefore: 10080 },
      ],
    });
    expect(await service.suggestReminderTime('fam_1', 'activity')).toBeNull();
  });
});

describe('Response tracking', () => {
  it('acceptance is recorded with a timestamp', async () => {
    const { service, prisma } = build();
    await service.accept('ins_1');
    expect(prisma.insight.update).toHaveBeenCalledWith({
      where: { id: 'ins_1' },
      data: { acceptedAt: expect.any(Date) },
    });
  });

  it('rejection is recorded too — without it there is no data on the AI value', async () => {
    const { service, prisma } = build();
    await service.reject('ins_1');
    expect(prisma.insight.update).toHaveBeenCalledWith({
      where: { id: 'ins_1' },
      data: { rejectedAt: expect.any(Date) },
    });
  });
});
