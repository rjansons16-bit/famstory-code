/**
 * Date formatting.
 *
 * Every date in the app goes through this file. It is the single place that
 * knows what a date looks like in a family product — and that is a design
 * decision, not something each of the 18 screens should re-invent.
 */

import { enUS, lv as lvDates } from 'date-fns/locale';
import {
  differenceInCalendarDays,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
  startOfDay,
} from 'date-fns';

import { currentLocale } from '@/data/locale';
import type { RepeatRule } from '@/domain/types';
import { t, tf } from '@/i18n';

/**
 * The date-fns locale that matches the language the app is speaking.
 *
 * Translating the labels and leaving the dates behind is the half-done version
 * of a second language, and it is the half a reader notices: "Tuvākās dzimšanas
 * dienas — pēc 5 dienām · Saturday, September 26" is two languages in one line.
 *
 * A function, not a constant, for the same reason `t()` is: this is read at the
 * moment a date is formatted, and the language can change while the app is
 * open. A module-level `const` would hold whichever language was loaded first.
 */
function dateLocale() {
  return currentLocale() === 'lv' ? lvDates : enUS;
}

/**
 * The order the parts of a date go in, which is not the same question as which
 * words they are written with.
 *
 * English is written day first, the way the design file writes it ("12 April
 * 1990") and the way English is read in the EU, where these families are:
 * "September 26" is the American order, and was what the app showed until
 * 2026-09-24 (docs/07-IMPROVEMENTS.md item 42). Latvian writes the day first
 * too, with the month in the locative and the year in front: "2026. gada
 * 26. septembrī". date-fns has no token for "a long date without the year",
 * which is the form a family app uses most, so the patterns are spelled out
 * per language.
 */
const PATTERNS = {
  en: {
    weekdayAndDay: 'EEEE d MMMM',
    dayInYear: 'd MMMM',
    dayWithYear: 'd MMMM yyyy',
    fullDay: 'EEEE d MMMM yyyy',
  },
  lv: {
    weekdayAndDay: 'EEEE, d. MMMM',
    dayInYear: 'd. MMMM',
    // "gada" is literal text; unescaped, date-fns reads every letter of it as
    // a field and refuses the whole pattern.
    dayWithYear: "yyyy. 'gada' d. MMMM",
    fullDay: "EEEE, yyyy. 'gada' d. MMMM",
  },
} as const;

function pattern(name: keyof (typeof PATTERNS)['en']): string {
  return PATTERNS[currentLocale() === 'lv' ? 'lv' : 'en'][name];
}

export function toDate(iso: string): Date {
  return parseISO(iso);
}

/** "Today" / "Tomorrow" / "12 September" */
export function friendlyDay(iso: string): string {
  const d = toDate(iso);
  if (isToday(d)) return t('common.today');
  if (isTomorrow(d)) return t('common.tomorrow');
  if (isYesterday(d)) return t('common.yesterday');

  const sameYear = d.getFullYear() === new Date().getFullYear();
  return format(d, pattern(sameYear ? 'dayInYear' : 'dayWithYear'), { locale: dateLocale() });
}

/**
 * "12 September", "8 March 2027" - always the date, never "Tomorrow": for a
 * sentence that already says when ("Renews on ...", "Atjaunosies ...", where
 * Latvian wants the locative "12. septembrī" that the pattern gives).
 */
export function calendarDay(iso: string): string {
  const d = toDate(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return format(d, pattern(sameYear ? 'dayInYear' : 'dayWithYear'), { locale: dateLocale() });
}

/** "16:30" — 24-hour. A family calendar is read at a glance; am/pm adds a token to parse. */
export function timeOfDay(iso: string): string {
  return format(toDate(iso), 'HH:mm', { locale: dateLocale() });
}

/** Card metadata line: "Today · 16:30", or just the day for an all-day event. */
export function eventTimeLabel(startsAt: string, allDay: boolean): string {
  const day = friendlyDay(startsAt);
  return allDay ? day : `${day} · ${timeOfDay(startsAt)}`;
}

/** Month label: "September 2026" */
export function monthLabel(iso: string | Date): string {
  const d = typeof iso === 'string' ? toDate(iso) : iso;
  return format(d, 'LLLL yyyy', { locale: dateLocale() });
}

/**
 * "September" / "septembris" - a month on its own, in the form a sentence
 * like "Your September" takes (the standalone nominative, which Latvian needs:
 * "Tavs septembris", not "septembrī").
 */
export function monthName(month: Date): string {
  return format(month, 'LLLL', { locale: dateLocale() });
}

/** "Jan" … "Dec", in calendar order — the date picker's month list. */
export function monthShortNames(): string[] {
  return Array.from({ length: 12 }, (_, m) => format(new Date(2024, m, 1), 'LLL', { locale: dateLocale() }));
}

/**
 * "Saturday, 26 September" — a day that is close enough that the year is noise.
 *
 * Used where the date is already known to be near: the birthdays coming up in
 * the next month. Spelling out "2026" there says nothing and costs a line.
 */
export function weekdayAndDay(day: Date): string {
  return format(day, pattern('weekdayAndDay'), { locale: dateLocale() });
}

/** "Saturday 14 March 1970" — what a screen reader says for a day in the picker. */
export function fullDayLabel(day: Date): string {
  return format(day, pattern('fullDay'), { locale: dateLocale() });
}

/**
 * Latvian day and month names after "kopš", which takes the genitive:
 * "kopš otrdienas", "kopš 12. septembra". date-fns writes the nominative for
 * weekdays and the locative for months ("12. septembrī"), and neither reads
 * right in that sentence. Indexed by getDay() and getMonth().
 */
const LV_WEEKDAY_GENITIVE = [
  'svētdienas',
  'pirmdienas',
  'otrdienas',
  'trešdienas',
  'ceturtdienas',
  'piektdienas',
  'sestdienas',
];
const LV_MONTH_GENITIVE = [
  'janvāra',
  'februāra',
  'marta',
  'aprīļa',
  'maija',
  'jūnija',
  'jūlija',
  'augusta',
  'septembra',
  'oktobra',
  'novembra',
  'decembra',
];

/**
 * Since when, as the end of a sentence: "today", "since yesterday", "since
 * Tuesday", "since 12 September". The banner over the timeline reads it as
 * "4 new since Tuesday".
 *
 * A weekday for the past week, because that is how a person thinks of a few
 * days ago; a date beyond it, because "since Tuesday" three weeks later would
 * mean the wrong Tuesday.
 */
export function sinceLabel(iso: string, now: Date = new Date()): string {
  const d = toDate(iso);
  const days = differenceInCalendarDays(now, d);
  const lv = currentLocale() === 'lv';

  if (days <= 0) return t('whatsNew.today');
  if (days === 1) return t('whatsNew.sinceYesterday');
  if (days < 7) {
    return tf('whatsNew.sinceDay', lv ? LV_WEEKDAY_GENITIVE[d.getDay()] : format(d, 'EEEE', { locale: enUS }));
  }
  const day = lv
    ? `${d.getDate()}. ${LV_MONTH_GENITIVE[d.getMonth()]}`
    : format(d, pattern('dayInYear'), { locale: enUS });
  return tf('whatsNew.sinceDay', day);
}

/**
 * A day picked in the date picker, as the moment to store.
 *
 * The time already there is kept: the composer picks the day and the time
 * separately, and choosing another day must not reset 16:30 to midnight.
 *
 * With nothing chosen before, the day is taken at NOON. A birthday is a date
 * with no time, but it travels as a moment, and midnight in Riga is still the
 * evening before in Dublin — a relative there would see the wrong birthday.
 * Noon lands on the same calendar day for anyone less than twelve hours away.
 */
export function withDay(day: Date, current?: string): string {
  const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0, 0);
  if (current) {
    const time = toDate(current);
    next.setHours(time.getHours(), time.getMinutes(), 0, 0);
  }
  return next.toISOString();
}

/** Is `day` later than the last day allowed? Compared as days, never as moments. */
export function isAfterDay(day: Date, limit: Date): boolean {
  return startOfDay(day).getTime() > startOfDay(limit).getTime();
}

/**
 * Timeline section header — relative, not calendrical.
 *
 * The design groups by "Today" and "Earlier this month" rather than by month
 * name, and that is the better call for a chronicle: "September 2026" is how an
 * archive is filed, "Today" is how a person remembers. The month name comes
 * back once an event is old enough that its distance is what matters.
 *
 * Returned as a key plus a label so the caller can sort sections without
 * re-parsing text.
 */
export function timelineSection(
  iso: string,
  now: Date = new Date(),
): { key: string; label: string; future: boolean } {
  const d = toDate(iso);
  const days = differenceInCalendarDays(d, now);

  // `future` is not decoration: everything else in the timeline reads newest
  // first, the way a chronicle does, and this one section has to read the other
  // way round. The caller cannot work that out from the label.
  if (days > 0) return { key: '0-upcoming', label: t('timeline.upcoming'), future: true };
  if (days === 0) return { key: '1-today', label: t('common.today'), future: false };
  if (days === -1) return { key: '2-yesterday', label: t('common.yesterday'), future: false };

  if (isSameMonth(d, now)) {
    return { key: '3-thismonth', label: t('timeline.earlierThisMonth'), future: false };
  }

  // Older than this month: the month name, newest first. The key sorts
  // lexicographically in reverse-chronological order.
  const stamp = `${d.getFullYear()}${String(d.getMonth()).padStart(2, '0')}`;
  const inverted = String(999999 - Number(stamp)).padStart(6, '0');
  return { key: `4-${inverted}`, label: monthLabel(d), future: false };
}

/**
 * Which day a week starts on. 0 = Sunday, 1 = Monday.
 *
 * Monday (ISO 8601) is the default: the study puts the EU first among target
 * markets, and a family calendar reads better when the weekend sits together at
 * the end. But the study names the US as a market too, where weeks start on
 * Sunday — so this is a value, not an assumption baked into two functions.
 *
 * It belongs to the locale. When a second language lands, this moves into the
 * locale record next to the date-fns locale, and both are read from the store.
 */
export const WEEK_STARTS_ON: 0 | 1 = 1;

/**
 * Calendar weekday header, in the order the grid uses: ["M", "T", "W", ...]
 */
export function weekdayInitials(): string[] {
  // 2024-01-01 was a Monday; 2023-12-31 was a Sunday.
  const start = new Date(2024, 0, 1 - (1 - WEEK_STARTS_ON));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return format(d, 'EEEEE', { locale: dateLocale() }).toUpperCase();
  });
}

/**
 * Month grid — always whole weeks, starting on WEEK_STARTS_ON.
 *
 * Returns 42 days (6 weeks) every time so the grid height does not jump
 * between months. A shifting grid is the kind of bug nobody reports and
 * everybody feels.
 */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // getDay(): 0 = Sunday. Shift so the configured first day lands on 0.
  const offset = (first.getDay() - WEEK_STARTS_ON + 7) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return startOfDay(d);
  });
}

export { differenceInCalendarDays, isSameDay, isSameMonth, isToday, startOfDay, format };

/**
 * Same calendar day, an earlier year — what "On this day" is built on.
 *
 * A pure predicate rather than a line inside the hook, so the edge cases can be
 * tested: today itself is not an anniversary, and 29 February only comes round
 * on a leap year (the alternative — treating 1 March as its anniversary — would
 * quietly move somebody's memory to the wrong day).
 */
export function isAnniversaryOfToday(iso: string, now: Date = new Date()): boolean {
  const d = toDate(iso);
  return (
    d.getFullYear() < now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** How many whole years ago. Only meaningful together with isAnniversaryOfToday. */
export function yearsSince(iso: string, now: Date = new Date()): number {
  return now.getFullYear() - toDate(iso).getFullYear();
}

/** Days until the event. Negative means it already happened. */
export function daysUntil(iso: string): number {
  return differenceInCalendarDays(toDate(iso), new Date());
}

/**
 * "today" / "tomorrow" / "in 5 days" - how far off a birthday or a special
 * day is, in lower case to follow its name: "Vera turns 69 in 5 days",
 * "Mātes diena pēc 3 dienām".
 */
export function inDaysLabel(inDays: number): string {
  if (inDays === 0) return t('birthday.today');
  if (inDays === 1) return t('birthday.tomorrow');
  return tf('birthday.inDays', inDays);
}

/** Reminder minutes → readable label. */
export function reminderLabel(minutesBefore: number | undefined): string {
  if (minutesBefore === undefined) return t('reminder.none');
  if (minutesBefore === 0) return t('reminder.atTime');
  if (minutesBefore === 10) return t('reminder.10min');
  if (minutesBefore === 60) return t('reminder.1hour');
  if (minutesBefore === 1440) return t('reminder.1day');
  if (minutesBefore === 10080) return t('reminder.1week');
  return `${minutesBefore} min`;
}

export const REMINDER_OPTIONS = [undefined, 0, 10, 60, 1440, 10080] as const;

/**
 * Would a reminder this long before `startsAt` already be due? Then saving it
 * would ring at once. No reminder (undefined) is never due.
 */
export function reminderAlreadyDue(
  startsAt: string,
  minutesBefore: number | undefined,
  now: Date = new Date(),
): boolean {
  if (minutesBefore === undefined) return false;
  return toDate(startsAt).getTime() - minutesBefore * 60_000 <= now.getTime();
}

/**
 * "1950 – 2026", or just the year somebody died when the birthday was never
 * entered. Years, not days: on a line of remembrance the day is the detail.
 */
export function lifeSpan(birthDate: string | undefined, diedOn: string | undefined): string {
  if (!diedOn) return '';
  const died = toDate(diedOn).getFullYear();
  return birthDate ? `${toDate(birthDate).getFullYear()} – ${died}` : `† ${died}`;
}

/** "Every week" - or "Does not repeat" for a one-off. */
export function repeatLabel(rule: RepeatRule | undefined): string {
  switch (rule) {
    case 'daily':
      return t('repeat.daily');
    case 'weekly':
      return t('repeat.weekly');
    case 'monthly':
      return t('repeat.monthly');
    case 'yearly':
      return t('repeat.yearly');
    default:
      return t('repeat.never');
  }
}

export const REPEAT_OPTIONS = [undefined, 'daily', 'weekly', 'monthly', 'yearly'] as const;
