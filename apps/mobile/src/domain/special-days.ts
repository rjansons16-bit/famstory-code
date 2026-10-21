import { t } from '@/i18n';
import { differenceInCalendarDays, startOfDay } from '@/lib/date';
import type { Member } from './types';

/**
 * THE DAYS A FAMILY MARKS besides its own birthdays - Mother's Day, Midsummer,
 * Christmas Eve, and the rest of the year's days that come with flowers, a
 * call or a present - as Latvia keeps them (docs/07-IMPROVEMENTS.md item 92).
 *
 * Nobody types these in, and nothing is stored: like a birthday, a special day
 * is computed wherever it is drawn - on the timeline a week ahead, on the
 * calendar, and on its own page. The server has the same rules
 * (apps/api/src/common/special-days.ts) for the reminder it sends three days
 * before; both test suites check the same dates.
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

const KEYS = new Set<string>(SPECIAL_DAYS.map((d) => d.key));

export function isSpecialDayKey(value: unknown): value is SpecialDayKey {
  return typeof value === 'string' && KEYS.has(value);
}

/** How far ahead the timeline mentions a day: a week is time to buy flowers. */
export const SPECIAL_DAY_WINDOW_DAYS = 7;

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
  const firstWeekday = new Date(year, month - 1, 1, 12).getDay();
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

/** A calendar day as this device's Date, at noon - like every date the app makes (lib/date.ts). */
export function toLocalDate(day: CalendarDay): Date {
  return new Date(day.year, day.month - 1, day.day, 12, 0, 0, 0);
}

/** The special day on this date, if there is one. */
export function specialDayOn(date: Date): SpecialDayKey | null {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  for (const { key } of SPECIAL_DAYS) {
    const on = dateOf(key, year);
    if (on.month === month && on.day === day) return key;
  }
  return null;
}

export interface SpecialDay {
  key: SpecialDayKey;
  /** The day, at noon. */
  day: Date;
  /** Whole days away. 0 is today. */
  inDays: number;
}

/** The day's next occurrence from `from` on - today counts. */
export function nextSpecialDay(key: SpecialDayKey, from: Date = new Date()): SpecialDay {
  const today = startOfDay(from);
  let day = toLocalDate(dateOf(key, today.getFullYear()));
  if (differenceInCalendarDays(day, today) < 0) day = toLocalDate(dateOf(key, today.getFullYear() + 1));
  return { key, day, inDays: differenceInCalendarDays(day, today) };
}

/**
 * The days coming up within `withinDays`, nearest first - today included,
 * and across New Year: on 29 December the list has New Year's Eve in it.
 */
export function upcomingSpecialDays(
  options: { from?: Date; withinDays?: number } = {},
): SpecialDay[] {
  const from = options.from ?? new Date();
  const within = options.withinDays ?? SPECIAL_DAY_WINDOW_DAYS;
  return SPECIAL_DAYS.map(({ key }) => nextSpecialDay(key, from))
    .filter((d) => d.inDays <= within)
    .sort((a, b) => a.inDays - b.inDays);
}

// ---------------------------------------------------------------------------
// In words. Called at render, never at import (see i18n/index.ts).
// ---------------------------------------------------------------------------

export function specialDayName(key: SpecialDayKey): string {
  return t(`special.${key}.name` as const);
}

/** One line about the day: what it is, or what it is for. */
export function specialDayHint(key: SpecialDayKey): string {
  return t(`special.${key}.hint` as const);
}

/** Three things a family might do or give - suggestions only, nothing happens by itself. */
export function specialDayIdeas(key: SpecialDayKey): string[] {
  return ([1, 2, 3] as const).map((n) => t(`special.${key}.idea.${n}` as const));
}

/**
 * The days that come with a present, and for whom: the adults on the days
 * for mothers, fathers, women and love - the family knows which of them the
 * day is for, and the app does not ask anybody's sex - the children on
 * theirs, and everybody on Christmas Eve.
 */
const PRESENT_DAYS: Partial<Record<SpecialDayKey, 'adults' | 'children' | 'everybody'>> = {
  valentines: 'adults',
  'womens-day': 'adults',
  'mothers-day': 'adults',
  'fathers-day': 'adults',
  'childrens-day': 'children',
  'christmas-eve': 'everybody',
};

/**
 * Whose page to look at for a present on this day - where their wish list and
 * gift ideas are. Never the viewer, nobody the family has lost, and nothing
 * for a child's profile to buy with.
 */
export function whoGetsPresents(key: SpecialDayKey, members: readonly Member[], viewer: Member | null): Member[] {
  const who = PRESENT_DAYS[key];
  if (!who || !viewer || viewer.role === 'child') return [];
  return members.filter(
    (m) =>
      m.id !== viewer.id &&
      m.status === 'active' &&
      !m.diedOn &&
      (who === 'everybody' || (who === 'children') === (m.role === 'child')),
  );
}
