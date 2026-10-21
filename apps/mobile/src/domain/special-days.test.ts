import assert from 'node:assert/strict';

import { useLocale } from '@/data/locale';
import {
  dateOf,
  easterSunday,
  isSpecialDayKey,
  nextSpecialDay,
  SPECIAL_DAYS,
  specialDayIdeas,
  specialDayName,
  specialDayOn,
  upcomingSpecialDays,
  whoGetsPresents,
} from './special-days';
import type { Member } from './types';

/**
 * The same dates as apps/api/src/common/special-days.spec.ts: the worker that
 * sends the reminder and the app that draws the day must agree on when it is.
 */
describe('Special days', () => {
  it('finds Western Easter', () => {
    assert.deepEqual(easterSunday(2024), { year: 2024, month: 3, day: 31 });
    assert.deepEqual(easterSunday(2025), { year: 2025, month: 4, day: 20 });
    assert.deepEqual(easterSunday(2026), { year: 2026, month: 4, day: 5 });
    assert.deepEqual(easterSunday(2027), { year: 2027, month: 3, day: 28 });
  });

  it("keeps Latvia's Sundays: Mother's Day in May, Father's Day in September, teachers in October", () => {
    assert.deepEqual(dateOf('mothers-day', 2026), { year: 2026, month: 5, day: 10 });
    assert.deepEqual(dateOf('mothers-day', 2027), { year: 2027, month: 5, day: 9 });
    assert.deepEqual(dateOf('fathers-day', 2026), { year: 2026, month: 9, day: 13 });
    assert.deepEqual(dateOf('teachers-day', 2026), { year: 2026, month: 10, day: 4 });
  });

  it('keeps the fixed dates', () => {
    assert.deepEqual(dateOf('midsummer', 2026), { year: 2026, month: 6, day: 23 });
    assert.deepEqual(dateOf('independence-day', 2026), { year: 2026, month: 11, day: 18 });
    assert.deepEqual(dateOf('christmas-eve', 2026), { year: 2026, month: 12, day: 24 });
  });

  it('says which day a date is, and nothing for an ordinary one', () => {
    assert.equal(specialDayOn(new Date(2026, 4, 10, 12)), 'mothers-day');
    assert.equal(specialDayOn(new Date(2026, 3, 5, 12)), 'easter');
    assert.equal(specialDayOn(new Date(2026, 4, 11, 12)), null);
  });

  it('knows its own keys, and nothing else', () => {
    assert.equal(isSpecialDayKey('midsummer'), true);
    assert.equal(isSpecialDayKey('talk-like-a-pirate-day'), false);
    assert.equal(isSpecialDayKey(undefined), false);
  });
});

describe('Special days coming up', () => {
  it("counts today, and a week ahead: Mother's Day from the Thursday before", () => {
    const thursday = new Date(2026, 4, 7, 18);
    const coming = upcomingSpecialDays({ from: thursday });

    assert.deepEqual(
      coming.map((d) => [d.key, d.inDays]),
      [['mothers-day', 3]],
    );
    assert.equal(nextSpecialDay('mothers-day', new Date(2026, 4, 10, 8)).inDays, 0);
  });

  it('looks across New Year', () => {
    const coming = upcomingSpecialDays({ from: new Date(2026, 11, 29, 12) });
    assert.deepEqual(
      coming.map((d) => [d.key, d.inDays]),
      [['new-years-eve', 2]],
    );
  });

  it('once a day has passed, the next one is next year', () => {
    const after = nextSpecialDay('christmas-eve', new Date(2026, 11, 25, 12));
    assert.equal(after.day.getFullYear(), 2027);
    assert.equal(after.inDays, 364);
  });

  it('a quiet week has nothing in it', () => {
    assert.deepEqual(upcomingSpecialDays({ from: new Date(2026, 6, 10, 12) }), []);
  });
});

describe('A special day in words', () => {
  afterEach(() => {
    useLocale.setState({ locale: 'en' });
  });

  it('has a name and three ideas in both languages', () => {
    for (const { key } of SPECIAL_DAYS) {
      const english = [specialDayName(key), ...specialDayIdeas(key)];
      useLocale.setState({ locale: 'lv' });
      const latvian = [specialDayName(key), ...specialDayIdeas(key)];
      useLocale.setState({ locale: 'en' });

      assert.equal(english.length, 4);
      assert.ok(english.every((line) => line.length > 0 && !line.startsWith('special.')), key);
      assert.notDeepEqual(latvian, english, key);
    }
    useLocale.setState({ locale: 'lv' });
    assert.equal(specialDayName('mothers-day'), 'Mātes diena');
  });
});

describe('Whose page to look at for a present', () => {
  function member(id: string, role: Member['role'], patch: Partial<Member> = {}): Member {
    return { id, familyId: 'f1', userId: null, displayName: id, role, status: 'active', groupIds: [], joinedAt: '', ...patch };
  }
  const anna = member('anna', 'admin');
  const family = [
    anna,
    member('martin', 'member'),
    member('emily', 'child'),
    member('vera', 'viewer'),
    member('juris', 'viewer', { diedOn: '2024-02-01' }),
    member('james', 'viewer', { status: 'invited' }),
  ];

  it("lists the other adults on Mother's Day, the children on theirs, everybody at Christmas", () => {
    assert.deepEqual(whoGetsPresents('mothers-day', family, anna).map((m) => m.id), ['martin', 'vera']);
    assert.deepEqual(whoGetsPresents('childrens-day', family, anna).map((m) => m.id), ['emily']);
    assert.deepEqual(whoGetsPresents('christmas-eve', family, anna).map((m) => m.id), ['martin', 'emily', 'vera']);
  });

  it('lists nobody on a day without presents, or for a child to buy for', () => {
    assert.deepEqual(whoGetsPresents('independence-day', family, anna), []);
    assert.deepEqual(whoGetsPresents('christmas-eve', family, family[2]), []);
    assert.deepEqual(whoGetsPresents('christmas-eve', family, null), []);
  });
});
