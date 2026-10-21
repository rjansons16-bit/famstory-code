import assert from 'node:assert/strict';

import type { FamilyEvent } from './types';
import { newSinceLastVisit } from './whats-new';

/**
 * "New" is about when something was ADDED and by whom - not when it happened.
 * The cases here are the ones a family would notice: their own event marked
 * new, an old memory added today missed, a first visit with everything lit up.
 */

function event(patch: Partial<FamilyEvent> & { id: string }): FamilyEvent {
  return {
    familyId: 'f1',
    title: patch.id,
    startsAt: '2026-09-01T12:00:00.000Z',
    allDay: false,
    categoryId: 'other',
    participantMemberIds: [],
    authorMemberId: 'mem_martin',
    visibility: { kind: 'family' },
    attachments: [],
    reactions: [],
    commentCount: 0,
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
    isMilestone: false,
    ...patch,
  };
}

const since = '2026-09-18T08:00:00.000Z';
const me = 'mem_anna';

describe('newSinceLastVisit', () => {
  it('counts what somebody else added after the last visit', () => {
    const found = newSinceLastVisit([event({ id: 'a' })], { since, memberId: me, opened: [] });
    assert.deepEqual(
      found.map((e) => e.id),
      ['a'],
    );
  });

  it('goes by when it was added, not when it happened', () => {
    // A photograph from 1974, put in yesterday: new. The point of the feature.
    const old = event({ id: 'old', startsAt: '1974-06-01T12:00:00.000Z' });
    // Something that happens next week but was written down before the visit.
    const planned = event({
      id: 'planned',
      startsAt: '2026-10-01T12:00:00.000Z',
      createdAt: '2026-09-10T12:00:00.000Z',
    });

    const found = newSinceLastVisit([old, planned], { since, memberId: me, opened: [] });
    assert.deepEqual(
      found.map((e) => e.id),
      ['old'],
    );
  });

  it('never counts your own', () => {
    const mine = event({ id: 'mine', authorMemberId: me });
    assert.equal(newSinceLastVisit([mine], { since, memberId: me, opened: [] }).length, 0);
  });

  it('forgets one once it has been opened', () => {
    const found = newSinceLastVisit([event({ id: 'a' }), event({ id: 'b' })], {
      since,
      memberId: me,
      opened: ['a'],
    });
    assert.deepEqual(
      found.map((e) => e.id),
      ['b'],
    );
  });

  it('shows nothing on a first visit, when everything would be new', () => {
    assert.equal(
      newSinceLastVisit([event({ id: 'a' })], { since: null, memberId: me, opened: [] }).length,
      0,
    );
  });

  it('shows nothing without somebody to be new for', () => {
    assert.equal(
      newSinceLastVisit([event({ id: 'a' })], { since, memberId: undefined, opened: [] }).length,
      0,
    );
  });

  it('treats a marker it cannot read as no marker, rather than as the year 1970', () => {
    assert.equal(
      newSinceLastVisit([event({ id: 'a' })], { since: 'garbage', memberId: me, opened: [] }).length,
      0,
    );
  });
});
