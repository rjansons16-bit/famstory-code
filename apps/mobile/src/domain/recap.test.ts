import assert from 'node:assert/strict';

import { RECAP_PHOTOS, monthKey, monthRecap, parseMonthKey, recapToOffer } from './recap';
import type { Attachment, FamilyEvent } from './types';

function photo(id: string): Attachment {
  return { id, kind: 'image', url: `https://x/${id}` };
}

function event(patch: Partial<FamilyEvent> & { id: string; startsAt: string }): FamilyEvent {
  return {
    familyId: 'f1',
    title: patch.id,
    allDay: false,
    categoryId: 'other',
    participantMemberIds: [],
    authorMemberId: 'mem_anna',
    visibility: { kind: 'family' },
    attachments: [],
    reactions: [],
    commentCount: 0,
    createdAt: patch.startsAt,
    updatedAt: patch.startsAt,
    isMilestone: false,
    ...patch,
  };
}

const at = (m: number, d: number) => new Date(2026, m - 1, d, 12).toISOString();

describe('A month, looked back on', () => {
  const events = [
    event({ id: 'holiday', startsAt: at(9, 5), categoryId: 'travel', participantMemberIds: ['emily', 'anna'],
      attachments: Array.from({ length: 12 }, (_, i) => photo(`h${i}`)) }),
    event({ id: 'birthday', startsAt: at(9, 20), categoryId: 'celebration', isMilestone: true,
      participantMemberIds: ['emily'], attachments: [photo('b0')] }),
    event({ id: 'october', startsAt: at(10, 2) }),
  ];

  it('counts only that month', () => {
    const recap = monthRecap(events, new Date(2026, 8, 1));
    assert.deepEqual(recap.events.map((e) => e.id), ['holiday', 'birthday']);
    assert.equal(recap.milestones, 1);
  });

  it('spreads the photographs so one holiday does not crowd out a birthday', () => {
    const recap = monthRecap(events, new Date(2026, 8, 1));
    assert.equal(recap.photos.length, RECAP_PHOTOS);
    assert.ok(recap.photos.some((p) => p.id === 'b0'), 'the birthday photograph must be in');
  });

  it('knows who was in it most', () => {
    const recap = monthRecap(events, new Date(2026, 8, 1));
    assert.deepEqual(recap.people[0], { memberId: 'emily', count: 2 });
  });
});

describe('When a recap is offered', () => {
  const september = [event({ id: 'a', startsAt: at(9, 10) })];

  it('in the first week of the next month', () => {
    const offered = recapToOffer(september, new Date(2026, 9, 3, 9));
    assert.equal(offered && monthKey(offered), '2026-09');
  });

  it('not after that', () => {
    assert.equal(recapToOffer(september, new Date(2026, 9, 12, 9)), null);
  });

  it('not for a month when nothing happened', () => {
    assert.equal(recapToOffer([], new Date(2026, 9, 3, 9)), null);
  });

  it('across a new year', () => {
    const december = [event({ id: 'b', startsAt: new Date(2026, 11, 24, 18).toISOString() })];
    const offered = recapToOffer(december, new Date(2027, 0, 2, 9));
    assert.equal(offered && monthKey(offered), '2026-12');
  });
});

describe('Month keys', () => {
  it('round-trip, and refuse what is not a month', () => {
    assert.equal(monthKey(parseMonthKey('2026-09')!), '2026-09');
    assert.equal(parseMonthKey('2026-13'), null);
    assert.equal(parseMonthKey('x'), null);
  });
});
