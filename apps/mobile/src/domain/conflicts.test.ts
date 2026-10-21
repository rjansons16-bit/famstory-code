import assert from 'node:assert/strict';

import { conflictKey, findConflict } from './conflicts';
import type { FamilyEvent } from './types';

/**
 * The same cases the server's ai.service.spec.ts checks, so the composer's
 * warning and the server's answer cannot drift apart unnoticed.
 */

function event(patch: Partial<FamilyEvent> & { id: string }): FamilyEvent {
  return {
    familyId: 'f1',
    title: patch.id,
    startsAt: '2026-10-27T16:00:00.000Z',
    allDay: false,
    categoryId: 'other',
    participantMemberIds: ['mem_emily'],
    authorMemberId: 'mem_anna',
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

const at = (startsAt: string, participantMemberIds = ['mem_emily']) => ({
  startsAt,
  allDay: false,
  participantMemberIds,
});

describe('findConflict', () => {
  it('finds an event that overlaps, and names who is in both', () => {
    const dentist = event({ id: 'dentist', endsAt: '2026-10-27T17:00:00.000Z', participantMemberIds: ['mem_emily', 'mem_anna'] });
    const found = findConflict([dentist], at('2026-10-27T16:30:00.000Z', ['mem_emily', 'mem_robert']));

    assert.deepEqual(found?.events.map((e) => e.id), ['dentist']);
    assert.deepEqual(found?.memberIds, ['mem_emily']);
  });

  it('back to back is not a conflict', () => {
    const dentist = event({ id: 'dentist', endsAt: '2026-10-27T17:00:00.000Z' });
    assert.equal(findConflict([dentist], at('2026-10-27T17:00:00.000Z')), null);
  });

  it('somebody else being busy is not a conflict', () => {
    const dentist = event({ id: 'dentist', participantMemberIds: ['mem_martin'] });
    assert.equal(findConflict([dentist], at('2026-10-27T16:00:00.000Z')), null);
  });

  it('with nobody chosen there is nothing to look for', () => {
    assert.equal(findConflict([event({ id: 'dentist' })], at('2026-10-27T16:00:00.000Z', [])), null);
  });

  it('all-day events never conflict, on either side', () => {
    const birthday = event({ id: 'birthday', allDay: true });
    assert.equal(findConflict([birthday], at('2026-10-27T16:00:00.000Z')), null);
    assert.equal(
      findConflict([event({ id: 'dentist' })], { ...at('2026-10-27T16:00:00.000Z'), allDay: true }),
      null,
    );
  });

  it('an open end is an hour, so a dentist at 15:30 is still there at 16:00', () => {
    const dentist = event({ id: 'dentist', startsAt: '2026-10-27T15:30:00.000Z' });
    assert.deepEqual(findConflict([dentist], at('2026-10-27T16:00:00.000Z'))?.events.map((e) => e.id), ['dentist']);
    // ...and gone by 16:30.
    assert.equal(findConflict([dentist], at('2026-10-27T16:30:00.000Z')), null);
  });

  it('the event being edited does not conflict with itself', () => {
    const self = event({ id: 'self' });
    assert.equal(findConflict([self], { ...at('2026-10-27T16:00:00.000Z'), id: 'self' }), null);
  });

  it('a weekly practice conflicts this week, not only the week it began', () => {
    // Tuesdays 18:00-19:30 in Riga since 20 October; asking about 27 October 18:15.
    const practice = event({
      id: 'practice',
      startsAt: '2026-10-20T15:00:00.000Z',
      endsAt: '2026-10-20T16:30:00.000Z',
      repeat: 'weekly',
      repeatTimeZone: 'Europe/Riga',
    });
    const found = findConflict([practice], at('2026-10-27T16:15:00.000Z'));

    assert.deepEqual(found?.events.map((e) => e.id), ['practice']);
    // Named as the occurrence that clashes, not as the first one - and still
    // at 18:00, though the clocks went back on the 25th.
    assert.equal(found?.events[0].occurrenceDay, '2026-10-27');
    assert.equal(found?.events[0].startsAt, '2026-10-27T16:00:00.000Z');
  });

  it('a week the practice was skipped is free', () => {
    const practice = event({
      id: 'practice',
      startsAt: '2026-10-20T15:00:00.000Z',
      endsAt: '2026-10-20T16:30:00.000Z',
      repeat: 'weekly',
      repeatSkips: ['2026-10-27'],
      repeatTimeZone: 'Europe/Riga',
    });
    assert.equal(findConflict([practice], at('2026-10-27T16:15:00.000Z')), null);
  });

  it('names at most three, soonest first', () => {
    const many = ['d', 'c', 'b', 'a'].map((id, i) =>
      event({ id, startsAt: `2026-10-27T16:${String(40 - i * 10).padStart(2, '0')}:00.000Z` }),
    );
    const found = findConflict(many, { ...at('2026-10-27T16:00:00.000Z'), endsAt: '2026-10-27T17:00:00.000Z' });
    assert.deepEqual(found?.events.map((e) => e.id), ['a', 'b', 'c']);
  });
});

describe('conflictKey', () => {
  it('stays the same for the same clash, and changes with another person', () => {
    const dentist = event({ id: 'dentist', participantMemberIds: ['mem_emily', 'mem_robert'] });
    const one = findConflict([dentist], at('2026-10-27T16:00:00.000Z'))!;
    const again = findConflict([dentist], at('2026-10-27T16:10:00.000Z'))!;
    const both = findConflict([dentist], at('2026-10-27T16:00:00.000Z', ['mem_emily', 'mem_robert']))!;

    assert.equal(conflictKey(one), conflictKey(again));
    assert.notEqual(conflictKey(one), conflictKey(both));
  });
});
