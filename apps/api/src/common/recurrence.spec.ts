import {
  dayKey,
  instantOf,
  nextOccurrence,
  nextReminderAt,
  occurrencesBetween,
  wallTime,
  type Series,
} from './recurrence';

/**
 * The cases a family would notice: practice moving an hour when the clocks
 * change, the 31st jumping into the next month, a skipped week coming back.
 * apps/mobile/src/domain/recurrence.test.ts runs the same cases on the app's
 * copy of this algorithm.
 */

const RIGA = 'Europe/Riga';
const days = (list: { day: string }[]) => list.map((o) => o.day);

describe('Wall-clock time in a zone', () => {
  it('reads an instant as Riga reads it, summer and winter', () => {
    expect(wallTime(new Date('2026-07-01T15:00:00Z'), RIGA)).toMatchObject({ h: 18 });
    expect(wallTime(new Date('2026-12-01T16:00:00Z'), RIGA)).toMatchObject({ h: 18 });
  });

  it('turns a local time back into the instant it names', () => {
    const at = instantOf({ y: 2026, m: 10, d: 27, h: 18, mi: 0, s: 0 }, RIGA);
    expect(at.toISOString()).toBe('2026-10-27T16:00:00.000Z');
  });

  it('falls back to the runtime zone for a zone it does not know, rather than failing', () => {
    expect(() => wallTime(new Date(), 'Mars/Olympus_Mons')).not.toThrow();
  });
});

describe('Weekly', () => {
  // Tuesday 20 October 2026, 18:00 in Riga (UTC+3). The clocks go back on
  // Sunday the 25th, and Riga is UTC+2 after that.
  const practice: Series = {
    startsAt: '2026-10-20T15:00:00.000Z',
    endsAt: '2026-10-20T16:30:00.000Z',
    repeat: 'weekly',
    repeatTimeZone: RIGA,
  };

  it('stays at 18:00 local through the clock change', () => {
    const [first, second] = occurrencesBetween(
      practice,
      new Date('2026-10-01T00:00:00Z'),
      new Date('2026-10-31T00:00:00Z'),
    );
    expect(first.startsAt.toISOString()).toBe('2026-10-20T15:00:00.000Z');
    expect(second.startsAt.toISOString()).toBe('2026-10-27T16:00:00.000Z');
    expect(second.endsAt?.toISOString()).toBe('2026-10-27T17:30:00.000Z');
  });

  it('stops after the last day it may start on, and that day still counts', () => {
    const three = { ...practice, repeatUntil: '2026-11-03T20:00:00.000Z' };
    expect(days(occurrencesBetween(three, new Date('2026-10-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z')))).toEqual([
      '2026-10-20',
      '2026-10-27',
      '2026-11-03',
    ]);
  });

  it('leaves out a skipped week and keeps the rest', () => {
    const skipped = { ...practice, repeatSkips: ['2026-10-27'] };
    expect(days(occurrencesBetween(skipped, new Date('2026-10-01T00:00:00Z'), new Date('2026-11-05T00:00:00Z')))).toEqual([
      '2026-10-20',
      '2026-11-03',
    ]);
  });

  it('finds this week without walking every week since the start', () => {
    const old = { ...practice, startsAt: '2016-10-18T15:00:00.000Z', endsAt: null };
    const found = occurrencesBetween(old, new Date('2026-10-26T00:00:00Z'), new Date('2026-11-01T00:00:00Z'));
    expect(days(found)).toEqual(['2026-10-27']);
  });
});

describe('Monthly and yearly', () => {
  it('the 31st is the last day of a shorter month, and comes back to the 31st', () => {
    const rent: Series = { startsAt: '2027-01-31T10:00:00.000Z', repeat: 'monthly', repeatTimeZone: RIGA };
    expect(days(occurrencesBetween(rent, new Date('2027-01-01T00:00:00Z'), new Date('2027-05-01T00:00:00Z')))).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
  });

  it('29 February is the 28th in other years', () => {
    const leapling: Series = { startsAt: '2028-02-29T10:00:00.000Z', repeat: 'yearly', repeatTimeZone: RIGA };
    expect(days(occurrencesBetween(leapling, new Date('2028-01-01T00:00:00Z'), new Date('2032-12-31T00:00:00Z')))).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });

  it('daily is every day', () => {
    const pill: Series = { startsAt: '2026-09-01T06:00:00.000Z', repeat: 'daily', repeatTimeZone: RIGA };
    expect(occurrencesBetween(pill, new Date('2026-09-01T00:00:00Z'), new Date('2026-09-08T00:00:00Z'))).toHaveLength(7);
  });
});

describe('A one-off event', () => {
  const once: Series = { startsAt: '2026-09-10T10:00:00.000Z', endsAt: '2026-09-10T12:00:00.000Z' };

  it('is a series of one', () => {
    expect(occurrencesBetween(once, new Date('2026-09-01T00:00:00Z'), new Date('2026-09-30T00:00:00Z'))).toHaveLength(1);
    expect(occurrencesBetween(once, new Date('2026-10-01T00:00:00Z'), new Date('2026-10-30T00:00:00Z'))).toHaveLength(0);
  });

  it('has no next once it has begun', () => {
    expect(nextOccurrence(once, new Date('2026-09-10T11:00:00Z'))).toBeNull();
  });
});

describe('The next reminder', () => {
  const practice: Series = { startsAt: '2026-10-20T15:00:00.000Z', repeat: 'weekly', repeatTimeZone: RIGA };

  it('is an hour before the next practice that is still ahead', () => {
    const at = nextReminderAt(practice, 60, new Date('2026-10-22T12:00:00Z'));
    expect(at?.toISOString()).toBe('2026-10-27T15:00:00.000Z');
  });

  it('moves past a practice whose reminder time has already gone', () => {
    // 15:30 UTC on the 27th: the reminder for today's practice (16:00 UTC) went at 15:00.
    const at = nextReminderAt(practice, 60, new Date('2026-10-27T15:30:00Z'));
    expect(at?.toISOString()).toBe('2026-11-03T15:00:00.000Z');
  });

  it('is simply start minus lead for a one-off, even in the past', () => {
    const once: Series = { startsAt: '2026-09-10T10:00:00.000Z' };
    expect(nextReminderAt(once, 10, new Date('2026-12-01T00:00:00Z'))?.toISOString()).toBe(
      '2026-09-10T09:50:00.000Z',
    );
  });

  it('is none when the series is over', () => {
    const ended = { ...practice, repeatUntil: '2026-10-27T20:00:00.000Z' };
    expect(nextReminderAt(ended, 60, new Date('2026-10-28T00:00:00Z'))).toBeNull();
  });
});

describe('dayKey', () => {
  it('pads months and days', () => {
    expect(dayKey({ y: 2026, m: 3, d: 5 })).toBe('2026-03-05');
  });
});
