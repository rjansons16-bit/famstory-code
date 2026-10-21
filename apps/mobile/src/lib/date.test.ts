import assert from 'node:assert/strict';

import { useLocale } from '@/data/locale';
import {
  REMINDER_OPTIONS,
  WEEK_STARTS_ON,
  daysUntil,
  eventTimeLabel,
  friendlyDay,
  fullDayLabel,
  isAfterDay,
  isAnniversaryOfToday,
  isSameDay,
  isToday,
  monthGrid,
  monthShortNames,
  reminderAlreadyDue,
  reminderLabel,
  sinceLabel,
  timeOfDay,
  timelineSection,
  weekdayAndDay,
  weekdayInitials,
  withDay,
  yearsSince,
} from './date';

/**
 * Date helper tests.
 *
 * The month grid is where bugs go unnoticed: a wrong week start or a varying
 * row count looks "almost right", and the only person who catches it is the
 * user who goes looking for a specific date and cannot find it.
 */

describe('monthGrid', () => {
  it('always returns 42 days, so the grid height never jumps between months', () => {
    for (let month = 0; month < 12; month++) {
      const grid = monthGrid(new Date(2026, month, 1));
      assert.equal(grid.length, 42, `month ${month + 1} has a different length`);
    }
  });

  it('starts on Monday (ISO 8601), not Sunday', () => {
    for (let month = 0; month < 12; month++) {
      const grid = monthGrid(new Date(2026, month, 1));
      assert.equal(grid[0].getDay(), 1, `month ${month + 1} does not start on Monday`);
    }
  });

  it('contains every day of the month', () => {
    const grid = monthGrid(new Date(2026, 1, 1)); // February
    assert.equal(grid.filter((d) => d.getMonth() === 1).length, 28);
  });

  it('fits a leap February in full', () => {
    const grid = monthGrid(new Date(2028, 1, 1));
    assert.equal(grid.filter((d) => d.getMonth() === 1).length, 29);
  });

  it('days are consecutive with no gaps or duplicates', () => {
    const grid = monthGrid(new Date(2026, 8, 1));
    for (let i = 1; i < grid.length; i++) {
      const diff = grid[i].getTime() - grid[i - 1].getTime();
      // Daylight saving changes the length of a day, so allow 23–25 hours.
      assert.ok(diff >= 23 * 36e5 && diff <= 25 * 36e5, `odd gap at index ${i}`);
    }
    assert.equal(new Set(grid.map((d) => d.toDateString())).size, 42);
  });

  it('every day is at the start of the day, so time never pollutes comparisons', () => {
    for (const day of monthGrid(new Date(2026, 5, 1))) {
      assert.equal(day.getHours(), 0);
      assert.equal(day.getMinutes(), 0);
    }
  });
});

describe('weekdayInitials', () => {
  it('gives seven days beginning with Monday', () => {
    const initials = weekdayInitials();
    assert.equal(initials.length, 7);
    assert.equal(initials[0], 'M');
    assert.equal(initials[6], 'S'); // Sunday last
  });
});

describe('friendlyDay', () => {
  it('names today rather than dating it', () => {
    assert.equal(friendlyDay(new Date().toISOString()), 'Today');
  });

  it('names tomorrow and yesterday too', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    assert.equal(friendlyDay(tomorrow.toISOString()), 'Tomorrow');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    assert.equal(friendlyDay(yesterday.toISOString()), 'Yesterday');
  });

  it('shows a month name for anything further out', () => {
    const far = new Date();
    far.setDate(far.getDate() + 40);
    const label = friendlyDay(far.toISOString());
    assert.ok(!['Today', 'Tomorrow', 'Yesterday'].includes(label));
    assert.match(label, /\d+ [A-Z][a-z]+/, `expected a date, got "${label}"`);
  });

  it('adds the year for a date in another year', () => {
    const later = new Date();
    later.setFullYear(later.getFullYear() + 2);
    assert.match(friendlyDay(later.toISOString()), /\d{4}/);
  });
});

describe('eventTimeLabel', () => {
  it('hides the time for an all-day event', () => {
    const label = eventTimeLabel(new Date().toISOString(), true);
    assert.equal(label, 'Today');
    assert.ok(!label.includes(':'));
  });

  it('shows day and time for a normal event', () => {
    const d = new Date();
    d.setHours(16, 30, 0, 0);
    assert.equal(eventTimeLabel(d.toISOString(), false), 'Today · 16:30');
  });

  it('uses 24-hour time', () => {
    const d = new Date();
    d.setHours(21, 5, 0, 0);
    assert.equal(timeOfDay(d.toISOString()), '21:05');
  });
});

describe('daysUntil', () => {
  it('today is 0', () => {
    assert.equal(daysUntil(new Date().toISOString()), 0);
  });

  it('future is positive, past is negative', () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    assert.equal(daysUntil(future.toISOString()), 7);

    const past = new Date();
    past.setDate(past.getDate() - 3);
    assert.equal(daysUntil(past.toISOString()), -3);
  });
});

describe('reminderLabel', () => {
  it('undefined means "no reminder", not an empty string', () => {
    assert.equal(reminderLabel(undefined), 'No reminder');
  });

  it('every offered option has human text, not the fallback format', () => {
    // The fallback is exactly "37 min". Match it with a pattern, not a
    // substring — "10 minutes before" also contains "min" but is correct text.
    const fallback = /^\d+ min$/;
    for (const option of REMINDER_OPTIONS) {
      const label = reminderLabel(option);
      assert.ok(label.length > 0);
      assert.ok(!fallback.test(label), `unhandled option: ${option} → ${label}`);
    }
  });

  it('all options are distinct from each other', () => {
    const labels = REMINDER_OPTIONS.map((o) => reminderLabel(o));
    assert.equal(new Set(labels).size, labels.length);
  });

  it('an unknown value does not crash, it shows minutes', () => {
    assert.equal(reminderLabel(37), '37 min');
  });
});

describe('reminderAlreadyDue', () => {
  const now = new Date('2026-09-26T09:00:00.000Z');

  it('a day before tomorrow afternoon is still ahead', () => {
    assert.equal(reminderAlreadyDue('2026-09-27T15:00:00.000Z', 1440, now), false);
  });

  it('a day before this evening has already gone', () => {
    // A memory written down the same day, with a default of "1 day before".
    assert.equal(reminderAlreadyDue('2026-09-26T18:00:00.000Z', 1440, now), true);
  });

  it('no reminder is never due', () => {
    assert.equal(reminderAlreadyDue('2020-01-01T00:00:00.000Z', undefined, now), false);
  });
});

describe('isSameDay', () => {
  it('one day at different times', () => {
    assert.equal(isSameDay(new Date(2026, 8, 1, 8, 0), new Date(2026, 8, 1, 23, 59)), true);
  });

  it('two different days', () => {
    assert.equal(isSameDay(new Date(2026, 8, 1), new Date(2026, 8, 2)), false);
  });
});

describe('The date picker', () => {
  it('keeps the time of day when only the day changes', () => {
    const current = new Date(2026, 8, 15, 16, 30).toISOString();
    const picked = new Date(withDay(new Date(2026, 8, 20), current));
    assert.equal(picked.getDate(), 20);
    assert.equal(picked.getHours(), 16);
    assert.equal(picked.getMinutes(), 30);
  });

  it('takes a first pick at noon, not midnight', () => {
    const picked = new Date(withDay(new Date(1970, 2, 14)));
    assert.deepEqual(
      [picked.getFullYear(), picked.getMonth(), picked.getDate(), picked.getHours()],
      [1970, 2, 14, 12],
    );
  });

  it('keeps a birthday on its day for a relative up to eleven hours away', () => {
    // Midnight would already be the day before for anyone to the west. Reading
    // the same instant shifted by an offset difference is exactly what a phone
    // in another time zone does.
    const stored = new Date(withDay(new Date(1970, 2, 14))).getTime();
    for (let hours = -11; hours <= 11; hours++) {
      const seen = new Date(stored + hours * 36e5);
      assert.equal(seen.getDate(), 14, `${hours}h away sees the ${seen.getDate()}th`);
    }
  });

  it('compares days, so today itself is never after today', () => {
    const lateToday = new Date();
    lateToday.setHours(23, 59, 0, 0);
    const earlyToday = new Date();
    earlyToday.setHours(0, 1, 0, 0);
    assert.equal(isAfterDay(lateToday, earlyToday), false);

    const tomorrow = new Date(earlyToday);
    tomorrow.setDate(tomorrow.getDate() + 1);
    assert.equal(isAfterDay(tomorrow, lateToday), true);
  });

  it('names twelve distinct months in calendar order', () => {
    const months = monthShortNames();
    assert.equal(months.length, 12);
    assert.equal(new Set(months).size, 12);
    assert.equal(months[0], 'Jan');
    assert.equal(months[11], 'Dec');
  });

  it('reads a whole day out for a screen reader', () => {
    assert.equal(fullDayLabel(new Date(1970, 2, 14)), 'Saturday 14 March 1970');
  });

  it('writes English day first, the way the design and the EU do', () => {
    // Not "September 26" - that is the American order.
    const thisYear = new Date().getFullYear();
    const farOff = new Date(thisYear, 8, 26, 12);
    if (!isToday(farOff) && Math.abs(daysUntil(farOff.toISOString())) > 1) {
      assert.equal(friendlyDay(farOff.toISOString()), '26 September');
    }
    assert.equal(friendlyDay(new Date(1990, 3, 12, 12).toISOString()), '12 April 1990');
    assert.equal(weekdayAndDay(new Date(2026, 8, 26, 12)), 'Saturday 26 September');
  });
});

describe('Since when', () => {
  const now = new Date(2026, 8, 24, 12, 0);
  const at = (d: number, h = 9) => new Date(2026, 8, d, h, 0).toISOString();

  afterEach(() => {
    useLocale.setState({ locale: 'en' });
  });

  it('reads as the end of a sentence in English', () => {
    assert.equal(sinceLabel(at(24), now), 'today');
    assert.equal(sinceLabel(at(23), now), 'since yesterday');
    // 22 September 2026 is a Tuesday.
    assert.equal(sinceLabel(at(22), now), 'since Tuesday');
    assert.equal(sinceLabel(at(12), now), 'since 12 September');
  });

  it('puts the day in the genitive after "kopš" in Latvian', () => {
    useLocale.setState({ locale: 'lv' });

    assert.equal(sinceLabel(at(24), now), 'šodien');
    assert.equal(sinceLabel(at(23), now), 'kopš vakardienas');
    assert.equal(sinceLabel(at(22), now), 'kopš otrdienas');
    assert.equal(sinceLabel(at(12), now), 'kopš 12. septembra');
  });

  it('switches to a date after a week, so it never means the wrong Tuesday', () => {
    // 15 September 2026 was also a Tuesday, nine days before `now`.
    assert.equal(sinceLabel(at(15), now), 'since 15 September');
  });
});

describe('Week start', () => {
  it('the grid and the header agree on the first day', () => {
    // These two are read from the same constant, but they compute it
    // separately — the bug this guards against is a header that says Monday
    // over a grid that starts on Sunday.
    const grid = monthGrid(new Date(2026, 8, 1));
    assert.equal(grid[0].getDay(), WEEK_STARTS_ON);
    assert.equal(weekdayInitials().length, 7);
  });

  it('the grid still starts before the 1st and covers six whole weeks', () => {
    for (const month of [0, 1, 5, 8, 11]) {
      const grid = monthGrid(new Date(2026, month, 1));
      assert.equal(grid.length, 42, 'the height must not jump between months');
      assert.equal(grid[0].getDay(), WEEK_STARTS_ON);
      assert.ok(grid[0] <= new Date(2026, month, 1));
    }
  });

  it('February in a leap year still fills six weeks', () => {
    const grid = monthGrid(new Date(2024, 1, 1));
    assert.equal(grid.length, 42);
    assert.equal(grid[0].getDay(), WEEK_STARTS_ON);
  });
});

describe('On this day', () => {
  const today = new Date(2026, 8, 15, 12, 0);

  function iso(y: number, m: number, d: number, h = 10): string {
    return new Date(y, m, d, h, 0, 0, 0).toISOString();
  }

  it('the same day one year ago is an anniversary', () => {
    assert.equal(isAnniversaryOfToday(iso(2025, 8, 15), today), true);
    assert.equal(yearsSince(iso(2025, 8, 15), today), 1);
  });

  it('several years back still counts', () => {
    assert.equal(isAnniversaryOfToday(iso(2019, 8, 15), today), true);
    assert.equal(yearsSince(iso(2019, 8, 15), today), 7);
  });

  it('today itself is NOT an anniversary — that would duplicate the timeline', () => {
    assert.equal(isAnniversaryOfToday(iso(2026, 8, 15), today), false);
  });

  it('the future is not an anniversary', () => {
    assert.equal(isAnniversaryOfToday(iso(2027, 8, 15), today), false);
  });

  it('a different day in the same month does not count', () => {
    assert.equal(isAnniversaryOfToday(iso(2025, 8, 14), today), false);
    assert.equal(isAnniversaryOfToday(iso(2025, 8, 16), today), false);
  });

  it('the same date in a different month does not count', () => {
    assert.equal(isAnniversaryOfToday(iso(2025, 7, 15), today), false);
  });

  it('the time of day is irrelevant', () => {
    assert.equal(isAnniversaryOfToday(iso(2025, 8, 15, 0), today), true);
    assert.equal(isAnniversaryOfToday(iso(2025, 8, 15, 23), today), true);
  });

  it('29 February only returns on a leap year, never on 1 March', () => {
    // The alternative — folding it onto 1 March — would move somebody's memory
    // to a day it did not happen on. Silence is the better failure here.
    const leapDay = iso(2024, 1, 29);
    assert.equal(isAnniversaryOfToday(leapDay, new Date(2028, 1, 29)), true);
    assert.equal(isAnniversaryOfToday(leapDay, new Date(2026, 2, 1)), false);
    assert.equal(isAnniversaryOfToday(leapDay, new Date(2026, 1, 28)), false);
  });
});

describe('Timeline sections', () => {
  const now = new Date(2026, 8, 9, 12, 0);
  const at = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0).toISOString();

  it('marks what is still ahead, so the timeline can order it the other way', () => {
    // Everything else reads newest first; "Coming up" has to read soonest
    // first, and the label alone cannot tell the screen which one it is.
    assert.equal(timelineSection(at(2026, 8, 15), now).future, true);
    assert.equal(timelineSection(at(2026, 8, 9), now).future, false);
    assert.equal(timelineSection(at(2026, 8, 8), now).future, false);
    assert.equal(timelineSection(at(2026, 7, 2), now).future, false);
  });

  it('puts the sections in order, newest month first', () => {
    const keys = [
      timelineSection(at(2026, 8, 15), now).key,
      timelineSection(at(2026, 8, 9), now).key,
      timelineSection(at(2026, 8, 8), now).key,
      timelineSection(at(2026, 8, 2), now).key,
      timelineSection(at(2026, 7, 2), now).key,
      timelineSection(at(2026, 6, 2), now).key,
    ];
    assert.deepEqual([...keys].sort(), keys);
  });
});

describe('Dates in Latvian', () => {
  afterEach(() => {
    useLocale.setState({ locale: 'en' });
  });

  it('puts the day before the month', () => {
    useLocale.setState({ locale: 'lv' });
    // A today of its own. Against the real clock this test broke on 25
    // September 2026, when the 26th became "Rīt" - and would have again in
    // 2027, when it needs a year in front.
    jest.useFakeTimers({ now: new Date(2026, 8, 1, 12) });

    try {
      // Not "September 26". The day comes first, and the month is in the case
      // Latvian uses for "on the 26th" - which is what a date label means and
      // what date-fns' own lv locale produces.
      assert.equal(friendlyDay(new Date(2026, 8, 26, 12).toISOString()), '26. septembrī');
    } finally {
      jest.useRealTimers();
    }
  });

  it('puts the year in front when the date is not this year', () => {
    useLocale.setState({ locale: 'lv' });

    assert.equal(
      friendlyDay(new Date(1990, 2, 14, 12).toISOString()),
      '1990. gada 14. martā',
    );
  });

  it('still says today in the language of the day', () => {
    useLocale.setState({ locale: 'lv' });

    assert.equal(friendlyDay(new Date().toISOString()), 'Šodien');
  });

  it('leaves the year out for a day that is days away', () => {
    useLocale.setState({ locale: 'lv' });

    // "on Saturday the 26th of September" - the case a date label is in.
    assert.equal(weekdayAndDay(new Date(2026, 8, 26, 12)), 'sestdienā, 26. septembrī');
  });

  it('names the months for the picker', () => {
    useLocale.setState({ locale: 'lv' });

    assert.equal(monthShortNames()[0], 'janv.');
  });
});
