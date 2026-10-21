import { differenceInCalendarDays, isSameDay, startOfDay, toDate } from '@/lib/date';
import type { Member } from './types';

/**
 * BIRTHDAYS.
 *
 * Onboarding asks every adult for their birthday and every child profile
 * carries one, and until this file existed the app did precisely nothing with
 * them: the date sat on the member's profile page, where you only look if you
 * already remembered. A family calendar that knows everybody's birthday and
 * never mentions one is worse than a paper calendar with pencil marks.
 *
 * Derived, not stored. A birthday is not an event anybody types in — it is a
 * fact about a person that repeats, so it is computed from the member list on
 * every screen that needs it. That also means it cannot drift out of date, be
 * deleted by accident, or need a migration when recurrence proper arrives.
 */

export interface Birthday {
  member: Member;
  /** The day the family celebrates it, in the year asked about. */
  day: Date;
  /** The age reached on that day. */
  turning: number;
  /** Whole days away. 0 is today, negative is past. */
  inDays: number;
}

/** How far ahead "coming up" looks. A month is what fits on one screen. */
export const BIRTHDAY_WINDOW_DAYS = 30;

/**
 * Which day a birthday falls on in a given year.
 *
 * 29 February needs a decision, and it is the opposite of the one
 * `isAnniversaryOfToday` makes for memories. A memory must not move: a
 * photograph taken on 29 February did not happen on 1 March, and pretending
 * otherwise files it under the wrong day forever. A birthday must not
 * disappear: a child born on 29 February has one every year, and a calendar
 * that skips three years out of four is no use to the family. It is celebrated
 * on 28 February — the last day of the month everybody already names.
 */
export function celebratedOn(birthDate: string, year: number): Date {
  const born = toDate(birthDate);
  const month = born.getMonth();

  // Noon, like every other date this app makes: a birthday must read as the
  // same day for a grandparent eleven hours away. See lib/date.ts.
  const day = new Date(year, month, born.getDate(), 12, 0, 0, 0);

  // A 29 February in a year without one has already rolled into March.
  if (day.getMonth() !== month) return new Date(year, month + 1, 0, 12, 0, 0, 0);

  return day;
}

/** Everybody whose birthday falls on this day, in this day's year. */
export function birthdaysOn(members: Member[], day: Date): Birthday[] {
  return celebrating(members)
    .map((member) => describe(member, day.getFullYear(), day))
    .filter((birthday) => isSameDay(birthday.day, day))
    .sort(byNearest);
}

/**
 * The birthdays worth warning the family about: today, and the next month.
 *
 * In December that means looking into next year — the whole point of the list
 * is the birthday you would otherwise walk past.
 */
export function upcomingBirthdays(
  members: Member[],
  options: { from?: Date; withinDays?: number } = {},
): Birthday[] {
  const from = startOfDay(options.from ?? new Date());
  const within = options.withinDays ?? BIRTHDAY_WINDOW_DAYS;

  return celebrating(members)
    .map((member) => {
      const thisYear = describe(member, from.getFullYear(), from);
      return thisYear.inDays >= 0 ? thisYear : describe(member, from.getFullYear() + 1, from);
    })
    .filter((birthday) => birthday.inDays >= 0 && birthday.inDays <= within)
    .sort(byNearest);
}

// ---------------------------------------------------------------------------

/**
 * Whose birthday the app may mention.
 *
 * A removed member is gone from the family's screens entirely, and an invited
 * one has not filled anything in yet — their row carries a name and nothing
 * else, so there is no date to be wrong about.
 */
function celebrating(members: Member[]): Member[] {
  // Not somebody the family has marked in memoriam: the strip would otherwise
  // announce "Vera turns 80" to her children every year (docs/07-IMPROVEMENTS.md 56).
  return members.filter((m) => m.status === 'active' && m.birthDate && !m.diedOn);
}

function describe(member: Member, year: number, from: Date): Birthday {
  const birthDate = member.birthDate as string;
  const day = celebratedOn(birthDate, year);

  return {
    member,
    day,
    turning: year - toDate(birthDate).getFullYear(),
    inDays: differenceInCalendarDays(day, from),
  };
}

/** Nearest first, and two on the same day in the order the family reads them. */
function byNearest(a: Birthday, b: Birthday): number {
  return a.inDays - b.inDays || a.member.displayName.localeCompare(b.member.displayName);
}
