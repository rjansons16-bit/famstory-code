import { Prisma } from '@prisma/client';

import type { PrismaService } from '../../common/prisma.service';
import { KNOWN_EVENTS } from './known-events';
import { scrubError, scrubRoute, scrubText } from './scrub';
import { MAX_BATCH, TelemetryService, whenItHappened } from './telemetry.service';

/**
 * What these hold is mostly what does NOT get stored: a person, content, a
 * key. The counters are only worth having if nobody has to wonder what else
 * went into the table with them.
 */

function build(
  options: {
    user?: { shareUsageStats: boolean; deletedAt: Date | null } | null;
    member?: { familyId: string } | null;
  } = {},
) {
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.user === undefined ? { shareUsageStats: true, deletedAt: null } : options.user),
    },
    member: {
      findFirst: jest.fn().mockResolvedValue(options.member === undefined ? { familyId: 'fam_1' } : options.member),
    },
    analyticsEvent: {
      createMany: jest.fn().mockImplementation(({ data }) => Promise.resolve({ count: data.length })),
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    clientError: {
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { service: new TelemetryService(prisma as unknown as PrismaService), prisma };
}

const NOW = new Date('2026-09-24T12:00:00.000Z');
const rows = (prisma: ReturnType<typeof build>['prisma']) =>
  prisma.analyticsEvent.createMany.mock.calls[0][0].data as Record<string, unknown>[];

describe('Recording product events', () => {
  it('keeps a known event with its listed fields, under the family', async () => {
    const { service, prisma } = build();
    const count = await service.record(
      'usr_1',
      'fam_1',
      [{ name: 'event_created', props: { categoryId: 'health', hasMedia: true, visibilityKind: 'groups' } }],
      NOW,
    );

    expect(count).toBe(1);
    expect(rows(prisma)[0]).toMatchObject({
      name: 'event_created',
      props: { categoryId: 'health', hasMedia: true, visibilityKind: 'groups' },
      familyId: 'fam_1',
    });
  });

  it('stores no person - not the user, not a member', async () => {
    const { service, prisma } = build();
    await service.record('usr_1', 'fam_1', [{ name: 'comment_added' }], NOW);

    const stored = JSON.stringify(rows(prisma));
    expect(stored).not.toContain('usr_1');
    expect(Object.keys(rows(prisma)[0]).sort()).toEqual(['createdAt', 'familyId', 'name', 'props']);
  });

  it('drops a name the app does not have', async () => {
    const { service, prisma } = build();
    const count = await service.record('usr_1', 'fam_1', [{ name: 'anything_at_all' }], NOW);

    expect(count).toBe(0);
    expect(prisma.analyticsEvent.createMany).not.toHaveBeenCalled();
  });

  it('drops a field that is not listed, and a word that is really a sentence', async () => {
    const { service, prisma } = build();
    await service.record(
      'usr_1',
      'fam_1',
      [
        { name: 'event_viewed', props: { eventId: 'evt_123' } },
        { name: 'timeline_filtered', props: { filter: 'Emily birthday party' } },
        { name: 'reaction_added', props: { kind: 'heart', title: 'Our trip' } },
      ],
      NOW,
    );

    const [viewed, filtered, reacted] = rows(prisma);
    expect(viewed.props).toBe(Prisma.JsonNull);
    expect(filtered.props).toBe(Prisma.JsonNull);
    expect(reacted.props).toEqual({ kind: 'heart' });
  });

  it('keeps only the listed shape of each field', async () => {
    const { service, prisma } = build();
    await service.record(
      'usr_1',
      'fam_1',
      [{ name: 'onboarding_completed', props: { peopleAdded: '3', firstEventCreated: 'yes' } }],
      NOW,
    );
    expect(rows(prisma)[0].props).toBe(Prisma.JsonNull);
  });

  it('does not believe a family the sender is not in', async () => {
    const { service, prisma } = build({ member: null });
    await service.record('usr_1', 'fam_other', [{ name: 'comment_added' }], NOW);
    expect(rows(prisma)[0].familyId).toBeNull();
  });

  it('keeps nothing for somebody who said no', async () => {
    const { service, prisma } = build({ user: { shareUsageStats: false, deletedAt: null } });
    const count = await service.record('usr_1', 'fam_1', [{ name: 'comment_added' }], NOW);

    expect(count).toBe(0);
    expect(prisma.analyticsEvent.createMany).not.toHaveBeenCalled();
  });

  it('keeps nothing for an account being deleted', async () => {
    const { service, prisma } = build({ user: { shareUsageStats: true, deletedAt: NOW } });
    await service.record('usr_1', 'fam_1', [{ name: 'comment_added' }], NOW);
    expect(prisma.analyticsEvent.createMany).not.toHaveBeenCalled();
  });

  it('takes at most one batch worth', async () => {
    const { service } = build();
    const flood = Array.from({ length: MAX_BATCH + 25 }, () => ({ name: 'comment_added' }));
    expect(await service.record('usr_1', 'fam_1', flood, NOW)).toBe(MAX_BATCH);
  });

  it('something that is not a list is nothing, not an error', async () => {
    const { service } = build();
    expect(await service.record('usr_1', 'fam_1', { name: 'comment_added' }, NOW)).toBe(0);
    expect(await service.record('usr_1', 'fam_1', undefined, NOW)).toBe(0);
  });
});

describe('When an event happened', () => {
  it("believes the device's time within a day", () => {
    expect(whenItHappened('2026-09-24T08:00:00.000Z', NOW).toISOString()).toBe('2026-09-24T08:00:00.000Z');
  });

  it('does not believe the future, or last week', () => {
    expect(whenItHappened('2026-09-25T12:00:00.000Z', NOW)).toEqual(NOW);
    expect(whenItHappened('2026-09-17T12:00:00.000Z', NOW)).toEqual(NOW);
    expect(whenItHappened('yesterday', NOW)).toEqual(NOW);
    expect(whenItHappened(undefined, NOW)).toEqual(NOW);
  });
});

describe('The list of events', () => {
  it('has every event the app sends', () => {
    // apps/mobile/src/domain/analytics.ts. An event missing here is one the
    // KPIs quietly never see.
    const fromTheApp = [
      'signup_completed',
      'family_created',
      'invitation_sent',
      'invitation_accepted',
      'onboarding_step_completed',
      'onboarding_completed',
      'event_created',
      'event_viewed',
      'comment_added',
      'voice_note_recorded',
      'voice_note_played',
      'dictation_used',
      'reaction_added',
      'visibility_changed',
      'group_created',
      'timeline_filtered',
      'app_opened',
      'reminder_delivered',
      'reminder_opened',
      'birthday_opened',
      'whats_new_shown',
      'whats_new_opened',
      'weekly_question_shown',
      'weekly_question_opened',
      'weekly_question_answered',
      'recap_shown',
      'recap_opened',
      'capsule_created',
      'surprise_wish_added',
      'surprise_opened',
      'lifestory_answered',
      'heirloom_sticker_created',
      'yearly_opened',
      'year_film_played',
      'year_film_saved',
      'app_installed',
      'interests_saved',
      'gift_ideas_shown',
      'gift_idea_taken',
      'gift_idea_searched',
      'special_day_opened',
      'push_answered',
      'content_reported',
      'member_blocked',
      'member_unblocked',
      'paywall_shown',
      'paywall_dismissed',
      'subscription_started',
      'subscription_cancelled',
      'purchase_restored',
      'purchase_failed',
      'review_requested',
      'suggestion_shown',
      'suggestion_accepted',
      'suggestion_rejected',
    ];
    expect(Object.keys(KNOWN_EVENTS).sort()).toEqual([...fromTheApp].sort());
  });
});

describe('Error reports', () => {
  it('keeps what broke and where', async () => {
    const { service, prisma } = build();
    await service.recordError({
      message: "TypeError: Cannot read properties of undefined (reading 'title')",
      stack: 'at EventCard (entry.js:1:2345)',
      platform: 'web',
      route: '/event/cm1abc2def3ghi4jkl5mno6pq',
      appVersion: '1.0.0',
    });

    expect(prisma.clientError.create).toHaveBeenCalledWith({
      data: {
        message: "TypeError: Cannot read properties of undefined (reading 'title')",
        stack: 'at EventCard (entry.js:1:2345)',
        platform: 'web',
        route: '/event/:id',
        appVersion: '1.0.0',
      },
    });
  });

  it('an empty report is not kept', async () => {
    const { service, prisma } = build();
    expect(await service.recordError({ message: '  ' })).toBe(false);
    expect(await service.recordError({})).toBe(false);
    expect(prisma.clientError.create).not.toHaveBeenCalled();
  });

  it('an unknown platform or a strange version is not repeated back', () => {
    expect(scrubError({ message: 'x', platform: 'windows 95', appVersion: '<script>' })).toMatchObject({
      platform: 'unknown',
      appVersion: null,
    });
  });
});

describe('Scrubbing', () => {
  it('takes out a guest link token and a signature', () => {
    const text = 'GET https://fam.example/v1/guest/4f9c2e7a1b3d5f60718293a4b5c6d7e8 failed';
    expect(scrubText(text, 500)).toBe('GET https://fam.example/v1/guest/[…] failed');
  });

  it('takes out a query string - where signed media links keep their key', () => {
    expect(scrubText('fetch /v1/media/a.jpg?exp=1727&sig=abc failed', 500)).toBe('fetch /v1/media/a.jpg?[…] failed');
  });

  it('takes out an email address', () => {
    expect(scrubText('No account for anna.berga@example.com', 500)).toBe('No account for [email]');
  });

  it('leaves the app’s own words alone', () => {
    const plain = "TypeError: undefined is not an object (evaluating 'e.title')";
    expect(scrubText(plain, 500)).toBe(plain);
  });

  it('cuts to length', () => {
    expect(scrubText('a'.repeat(10) + ' ' + 'b'.repeat(10), 12)).toHaveLength(12);
  });

  it('keeps a route as its pattern', () => {
    expect(scrubRoute('/event/evt_training?occurrence=2026-10-27')).toBe('/event/:id');
    expect(scrubRoute('/guest/abc123def456')).toBe('/guest/:id');
    expect(scrubRoute('/family/member/cm1x/wishes')).toBe('/family/member/:id/wishes');
    expect(scrubRoute('/')).toBe('/');
    expect(scrubRoute('/recap')).toBe('/recap');
    expect(scrubRoute('not a path')).toBeNull();
    expect(scrubRoute(42)).toBeNull();
  });
});

describe('Retention', () => {
  it('deletes product events after 400 days and errors after 90', async () => {
    const { service, prisma } = build();
    expect(await service.sweep(NOW)).toEqual({ events: 2, errors: 1 });

    const eventsBefore = prisma.analyticsEvent.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    const errorsBefore = prisma.clientError.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    expect(eventsBefore.toISOString()).toBe('2025-08-20T12:00:00.000Z');
    expect(errorsBefore.toISOString()).toBe('2026-06-26T12:00:00.000Z');
  });
});
