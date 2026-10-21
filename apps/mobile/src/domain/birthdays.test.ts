import assert from 'node:assert/strict';

import { birthdaysOn, celebratedOn, upcomingBirthdays } from './birthdays';
import type { Member } from './types';

/**
 * The rules a family would notice if they were wrong: the birthday that falls
 * in the next year, the one on 29 February, and the people who must not appear.
 */

function member(patch: Partial<Member> & { id: string }): Member {
  return {
    familyId: 'f1',
    userId: null,
    displayName: patch.id,
    role: 'member',
    status: 'active',
    groupIds: [],
    joinedAt: '2026-01-01T12:00:00.000Z',
    ...patch,
  };
}

/** Local noon, the way the app stores a date with no time of day. */
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();

describe('celebratedOn', () => {
  it('keeps the day of the month', () => {
    const day = celebratedOn(at(1990, 3, 14), 2026);

    assert.equal(day.getFullYear(), 2026);
    assert.equal(day.getMonth(), 2);
    assert.equal(day.getDate(), 14);
  });

  it('celebrates a 29 February birthday every year', () => {
    const leap = celebratedOn(at(2024, 2, 29), 2028);
    assert.equal(leap.getMonth(), 1);
    assert.equal(leap.getDate(), 29);

    // Not 1 March, and not skipped: the last day of the same month.
    const ordinary = celebratedOn(at(2024, 2, 29), 2027);
    assert.equal(ordinary.getMonth(), 1);
    assert.equal(ordinary.getDate(), 28);
  });
});

describe('birthdaysOn', () => {
  const anna = member({ id: 'anna', displayName: 'Anna', birthDate: at(1990, 5, 2) });
  const bruno = member({ id: 'bruno', displayName: 'Bruno', birthDate: at(2015, 5, 2) });
  const carl = member({ id: 'carl', displayName: 'Carl', birthDate: at(1988, 7, 9) });

  it('finds everybody born on that day and says how old they turn', () => {
    const found = birthdaysOn([anna, bruno, carl], new Date(2026, 4, 2, 9, 0, 0));

    assert.deepEqual(
      found.map((b) => [b.member.displayName, b.turning]),
      [
        ['Anna', 36],
        ['Bruno', 11],
      ],
    );
  });

  it('is empty on a day nobody was born', () => {
    assert.equal(birthdaysOn([anna, carl], new Date(2026, 4, 3, 9, 0, 0)).length, 0);
  });
});

describe('upcomingBirthdays', () => {
  const soon = member({ id: 'soon', displayName: 'Soon', birthDate: at(1990, 1, 10) });
  const later = member({ id: 'later', displayName: 'Later', birthDate: at(1980, 6, 1) });

  it('counts today as coming up', () => {
    const list = upcomingBirthdays([soon], { from: new Date(2026, 0, 10, 8, 0, 0) });

    assert.equal(list.length, 1);
    assert.equal(list[0].inDays, 0);
    assert.equal(list[0].turning, 36);
  });

  it('looks into next year from December', () => {
    const list = upcomingBirthdays([soon], { from: new Date(2026, 11, 28, 8, 0, 0) });

    assert.equal(list.length, 1);
    assert.equal(list[0].day.getFullYear(), 2027);
    assert.equal(list[0].inDays, 13);
    assert.equal(list[0].turning, 37);
  });

  it('stops at the end of the window', () => {
    const list = upcomingBirthdays([soon, later], { from: new Date(2026, 0, 1, 8, 0, 0) });

    assert.deepEqual(
      list.map((b) => b.member.displayName),
      ['Soon'],
    );
  });

  it('leaves out people the family has removed, and rows nobody filled in', () => {
    const gone = member({ ...soon, id: 'gone', displayName: 'Gone', status: 'removed' });
    const invited = member({ id: 'invited', displayName: 'Invited', status: 'invited' });
    const blank = member({ id: 'blank', displayName: 'Blank' });

    const list = upcomingBirthdays([gone, invited, blank], { from: new Date(2026, 0, 1, 8, 0, 0) });

    assert.equal(list.length, 0);
  });

  it('never announces the birthday of somebody the family has marked in memoriam', () => {
    const remembered = member({ ...soon, id: 'vera', displayName: 'Vera', diedOn: at(2025, 3, 2) });

    assert.equal(upcomingBirthdays([remembered], { from: new Date(2026, 0, 1, 8, 0, 0) }).length, 0);
    assert.equal(birthdaysOn([remembered], new Date(2026, 0, 10, 9, 0, 0)).length, 0);
  });
});
