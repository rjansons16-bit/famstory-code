import assert from 'node:assert/strict';

import {
  dayBefore,
  expandBetween,
  nextOccurrence,
  occurrencesBetween,
  timelinePlace,
} from './recurrence';
import type { FamilyEvent } from './types';

/**
 * The same dates as apps/api/src/common/recurrence.spec.ts: the two copies of
 * the algorithm have to agree, or the calendar shows one Tuesday and the
 * reminder fires on another.
 */

const RIGA = 'Europe/Riga';
const days = (list: { day: string }[]) => list.map((o) => o.day);
const at = (iso: string) => new Date(iso);

function event(patch: Partial<FamilyEvent> = {}): FamilyEvent {
  return {
    id: 'evt_practice',
    familyId: 'f1',
    title: 'Football',
    startsAt: '2026-10-20T15:00:00.000Z',
    endsAt: '2026-10-20T16:30:00.000Z',
    allDay: false,
    categoryId: 'activity',
    participantMemberIds: [],
    authorMemberId: 'mem_anna',
    visibility: { kind: 'family' },
    attachments: [],
    reactions: [],
    commentCount: 0,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    isMilestone: false,
    repeat: 'weekly',
    repeatTimeZone: RIGA,
    ...patch,
  };
}

describe('Weekly', () => {
  it('stays at 18:00 local through the clock change', () => {
    const [first, second] = occurrencesBetween(
      event(),
      at('2026-10-01T00:00:00Z'),
      at('2026-10-31T00:00:00Z'),
    );
    assert.equal(first.startsAt, '2026-10-20T15:00:00.000Z');
    assert.equal(second.startsAt, '2026-10-27T16:00:00.000Z');
    assert.equal(second.endsAt, '2026-10-27T17:30:00.000Z');
  });

  it('stops after its last day, and that day still counts', () => {
    const found = occurrencesBetween(
      event({ repeatUntil: '2026-11-03T20:00:00.000Z' }),
      at('2026-10-01T00:00:00Z'),
      at('2027-01-01T00:00:00Z'),
    );
    assert.deepEqual(days(found), ['2026-10-20', '2026-10-27', '2026-11-03']);
  });

  it('leaves out a skipped week', () => {
    const found = occurrencesBetween(
      event({ repeatSkips: ['2026-10-27'] }),
      at('2026-10-01T00:00:00Z'),
      at('2026-11-05T00:00:00Z'),
    );
    assert.deepEqual(days(found), ['2026-10-20', '2026-11-03']);
  });

  it('finds this week of a series that began ten years ago', () => {
    const found = occurrencesBetween(
      event({ startsAt: '2016-10-18T15:00:00.000Z', endsAt: undefined }),
      at('2026-10-26T00:00:00Z'),
      at('2026-11-01T00:00:00Z'),
    );
    assert.deepEqual(days(found), ['2026-10-27']);
  });
});

describe('Monthly and yearly', () => {
  it('the 31st is the last day of a shorter month, and comes back', () => {
    const found = occurrencesBetween(
      event({ startsAt: '2027-01-31T10:00:00.000Z', endsAt: undefined, repeat: 'monthly' }),
      at('2027-01-01T00:00:00Z'),
      at('2027-05-01T00:00:00Z'),
    );
    assert.deepEqual(days(found), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });

  it('29 February is the 28th in other years', () => {
    const found = occurrencesBetween(
      event({ startsAt: '2028-02-29T10:00:00.000Z', endsAt: undefined, repeat: 'yearly' }),
      at('2028-01-01T00:00:00Z'),
      at('2032-12-31T00:00:00Z'),
    );
    assert.deepEqual(days(found), [
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });
});

describe('A one-off event', () => {
  const once = event({ repeat: undefined, startsAt: '2026-09-10T10:00:00.000Z', endsAt: '2026-09-10T12:00:00.000Z' });

  it('is a series of one', () => {
    assert.equal(occurrencesBetween(once, at('2026-09-01T00:00:00Z'), at('2026-09-30T00:00:00Z')).length, 1);
    assert.equal(occurrencesBetween(once, at('2026-10-01T00:00:00Z'), at('2026-10-30T00:00:00Z')).length, 0);
  });

  it('has no next once it has begun', () => {
    assert.equal(nextOccurrence(once, at('2026-09-10T11:00:00Z')), null);
  });
});

describe('Spreading a series over the calendar', () => {
  it('draws one copy per occurrence, each saying which day it is', () => {
    const copies = expandBetween([event()], at('2026-10-01T00:00:00Z'), at('2026-11-01T00:00:00Z'));
    assert.deepEqual(
      copies.map((c) => c.occurrenceDay),
      ['2026-10-20', '2026-10-27'],
    );
    // Same event, so opening a copy opens the series.
    assert.ok(copies.every((c) => c.id === 'evt_practice'));
  });

  it('leaves a one-off exactly as it was', () => {
    const once = event({ repeat: undefined });
    assert.deepEqual(expandBetween([once], at('2020-01-01T00:00:00Z'), at('2020-02-01T00:00:00Z')), [once]);
  });
});

describe('Where a series sits in the timeline', () => {
  it('at its next occurrence, counting today', () => {
    // Wednesday 21 October: next is Tuesday the 27th.
    const placed = timelinePlace(event(), new Date(2026, 9, 21, 12));
    assert.equal(placed.occurrenceDay, '2026-10-27');
  });

  it('at its last occurrence once it is over', () => {
    const ended = event({ repeatUntil: '2026-10-27T20:00:00.000Z' });
    const placed = timelinePlace(ended, new Date(2026, 11, 1, 12));
    assert.equal(placed.occurrenceDay, '2026-10-27');
  });
});

describe('dayBefore', () => {
  it('crosses a month and a year', () => {
    assert.equal(dayBefore('2026-11-01'), '2026-10-31');
    assert.equal(dayBefore('2027-01-01'), '2026-12-31');
  });
});
