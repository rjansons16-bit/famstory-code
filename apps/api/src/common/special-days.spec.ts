import { addDays, dateOf, easterSunday, specialDayOn } from './special-days';

/**
 * The same dates as apps/mobile/src/domain/special-days.test.ts: the worker
 * that announces a day and the app that draws it must agree on when it is.
 */
describe('Special days', () => {
  it('finds Western Easter', () => {
    expect(easterSunday(2024)).toEqual({ year: 2024, month: 3, day: 31 });
    expect(easterSunday(2025)).toEqual({ year: 2025, month: 4, day: 20 });
    expect(easterSunday(2026)).toEqual({ year: 2026, month: 4, day: 5 });
    expect(easterSunday(2027)).toEqual({ year: 2027, month: 3, day: 28 });
  });

  it("keeps Latvia's Sundays: Mother's Day in May, Father's Day in September, teachers in October", () => {
    expect(dateOf('mothers-day', 2026)).toEqual({ year: 2026, month: 5, day: 10 });
    expect(dateOf('mothers-day', 2027)).toEqual({ year: 2027, month: 5, day: 9 });
    expect(dateOf('fathers-day', 2026)).toEqual({ year: 2026, month: 9, day: 13 });
    expect(dateOf('teachers-day', 2026)).toEqual({ year: 2026, month: 10, day: 4 });
  });

  it('keeps the fixed dates', () => {
    expect(dateOf('midsummer', 2026)).toEqual({ year: 2026, month: 6, day: 23 });
    expect(dateOf('independence-day', 2026)).toEqual({ year: 2026, month: 11, day: 18 });
    expect(dateOf('christmas-eve', 2026)).toEqual({ year: 2026, month: 12, day: 24 });
  });

  it('says which day a date is, and nothing for an ordinary one', () => {
    expect(specialDayOn({ year: 2026, month: 5, day: 10 })).toBe('mothers-day');
    expect(specialDayOn({ year: 2026, month: 4, day: 5 })).toBe('easter');
    expect(specialDayOn({ year: 2026, month: 5, day: 11 })).toBeNull();
  });

  it('counts days across a month and a year', () => {
    expect(addDays({ year: 2026, month: 12, day: 30 }, 3)).toEqual({ year: 2027, month: 1, day: 2 });
    expect(addDays({ year: 2026, month: 2, day: 27 }, 2)).toEqual({ year: 2026, month: 3, day: 1 });
  });
});
