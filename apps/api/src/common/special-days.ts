/**
 * THE DAYS A FAMILY MARKS besides its own birthdays - Mother's Day, Midsummer,
 * Christmas Eve, and the rest of the year's days that come with flowers, a
 * call or a present - as Latvia keeps them (docs/07-IMPROVEMENTS.md item 92).
 *
 * Plain calendar dates, no time zone: the caller decides what "today" is (the
 * worker asks for Riga's). The app's copy is apps/mobile/src/domain/
 * special-days.ts, and both test suites check the same dates.
 */

export type SpecialDayKey =
  | 'valentines'
  | 'womens-day'
  | 'easter'
  | 'mothers-day'
  | 'childrens-day'
  | 'midsummer'
  | 'knowledge-day'
  | 'fathers-day'
  | 'teachers-day'
  | 'independence-day'
  | 'christmas-eve'
  | 'new-years-eve';

export interface CalendarDay {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
}

type Rule =
  | { kind: 'fixed'; month: number; day: number }
  | { kind: 'nth-sunday'; month: number; n: number }
  | { kind: 'easter' };

export const SPECIAL_DAYS: readonly { key: SpecialDayKey; rule: Rule }[] = [
  { key: 'valentines', rule: { kind: 'fixed', month: 2, day: 14 } },
  { key: 'womens-day', rule: { kind: 'fixed', month: 3, day: 8 } },
  // Western Easter, the one Latvia's calendar keeps.
  { key: 'easter', rule: { kind: 'easter' } },
  // The second Sunday of May, as in Latvia - not Britain's date in Lent.
  { key: 'mothers-day', rule: { kind: 'nth-sunday', month: 5, n: 2 } },
  { key: 'childrens-day', rule: { kind: 'fixed', month: 6, day: 1 } },
  // Līgo evening; Jāņi is the day after.
  { key: 'midsummer', rule: { kind: 'fixed', month: 6, day: 23 } },
  { key: 'knowledge-day', rule: { kind: 'fixed', month: 9, day: 1 } },
  // The second Sunday of September, Latvia's since 2008.
  { key: 'fathers-day', rule: { kind: 'nth-sunday', month: 9, n: 2 } },
  { key: 'teachers-day', rule: { kind: 'nth-sunday', month: 10, n: 1 } },
  { key: 'independence-day', rule: { kind: 'fixed', month: 11, day: 18 } },
  { key: 'christmas-eve', rule: { kind: 'fixed', month: 12, day: 24 } },
  { key: 'new-years-eve', rule: { kind: 'fixed', month: 12, day: 31 } },
];

/** Western Easter Sunday: the Anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
export function easterSunday(year: number): CalendarDay {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function nthSunday(year: number, month: number, n: number): CalendarDay {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstSunday = 1 + ((7 - firstWeekday) % 7);
  return { year, month, day: firstSunday + 7 * (n - 1) };
}

/** When `key` falls in `year`. */
export function dateOf(key: SpecialDayKey, year: number): CalendarDay {
  const entry = SPECIAL_DAYS.find((d) => d.key === key);
  if (!entry) throw new Error(`Unknown special day: ${key}`);
  const rule = entry.rule;
  if (rule.kind === 'fixed') return { year, month: rule.month, day: rule.day };
  if (rule.kind === 'nth-sunday') return nthSunday(year, rule.month, rule.n);
  return easterSunday(year);
}

function sameDay(a: CalendarDay, b: CalendarDay): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** The special day on `date`, if there is one. */
export function specialDayOn(date: CalendarDay): SpecialDayKey | null {
  for (const { key } of SPECIAL_DAYS) {
    if (sameDay(dateOf(key, date.year), date)) return key;
  }
  return null;
}

/** `date` moved by `days`, across months and years. */
export function addDays(date: CalendarDay, days: number): CalendarDay {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

/**
 * The instant a special day is stored as: noon UTC on its date, which is the
 * same calendar day in every zone a family is likely to be in.
 */
export function dayInstant(date: CalendarDay): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
}
