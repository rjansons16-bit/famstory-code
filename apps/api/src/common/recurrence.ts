/**
 * REPEATING EVENTS - when the occurrences of a series fall.
 *
 * A series is one Event row with a `repeat` rule (schema.prisma). Nothing
 * stores the occurrences: they are computed, here for the reminder worker and
 * the calendar feed, and in apps/mobile/src/domain/recurrence.ts for the
 * screens. The two files are the same algorithm and share their test cases
 * (docs/07-IMPROVEMENTS.md item 11 is the debt of having two).
 *
 * THE RULE, IN WALL-CLOCK TIME. "Football, Tuesdays at 18:00" is 18:00 in the
 * zone it was made in, through both clock changes - a fixed UTC hour would
 * move it to 19:00 every winter. So each occurrence is the first one's local
 * date and time, moved on by whole days, months or years in that zone, and
 * only then turned back into an instant.
 *
 *   daily    the same time, every day
 *   weekly   the same weekday and time
 *   monthly  the same day of the month - or the month's last day, when it has
 *            fewer (the 31st is the 30th in April, not the 1st of May)
 *   yearly   the same date - 29 February is the 28th in other years
 *
 * Counted from the FIRST occurrence every time, never from the previous one,
 * so a series on the 31st that passes through February comes back to the 31st.
 */

export type RepeatRule = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Series {
  startsAt: string | Date;
  endsAt?: string | Date | null;
  repeat?: RepeatRule | null;
  /** Its local day in the series' zone is the last one an occurrence may start on. */
  repeatUntil?: string | Date | null;
  /** Local days, YYYY-MM-DD, taken out of the series. */
  repeatSkips?: readonly string[] | null;
  /** IANA zone. Without one, or one this runtime does not know, the runtime's own. */
  repeatTimeZone?: string | null;
}

export interface Occurrence {
  /** Which one: 0 is the first. */
  index: number;
  /** Its local day in the series' zone - what a skip names. */
  day: string;
  startsAt: Date;
  endsAt: Date | null;
}

interface Wall {
  y: number;
  /** 1-12 */
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

/** Enough for a daily series across thirteen years; a guard, not a limit anyone meets. */
const MAX_STEPS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  if (!formatters.has(timeZone)) {
    try {
      formatters.set(
        timeZone,
        new Intl.DateTimeFormat('en-US', {
          timeZone,
          hourCycle: 'h23',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
        }),
      );
    } catch {
      // A zone this runtime has never heard of: fall back rather than fail.
      formatters.set(timeZone, null);
    }
  }
  return formatters.get(timeZone) ?? null;
}

/** Whether this runtime can compute in the zone ("Europe/Riga" yes, "Mars/Base" no). */
export function isKnownZone(timeZone: string): boolean {
  return formatterFor(timeZone) !== null;
}

/** The local date and time of an instant in a zone. */
export function wallTime(instant: Date, timeZone?: string | null): Wall {
  const formatter = timeZone ? formatterFor(timeZone) : null;
  if (!formatter) {
    return {
      y: instant.getFullYear(),
      m: instant.getMonth() + 1,
      d: instant.getDate(),
      h: instant.getHours(),
      mi: instant.getMinutes(),
      s: instant.getSeconds(),
    };
  }
  const parts = formatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') };
}

/** How far a zone is ahead of UTC at an instant, in milliseconds. */
function offsetAt(ms: number, timeZone: string): number {
  const w = wallTime(new Date(ms), timeZone);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant a local date and time names in a zone.
 *
 * Two passes, because the offset to use is the one in force at the answer,
 * not at the guess - which differ for the hours around a clock change. A time
 * that does not exist (02:30 on the night the clocks go forward) lands an hour
 * later, which is what a calendar does with it too.
 */
export function instantOf(wall: Wall, timeZone?: string | null): Date {
  if (!timeZone || !formatterFor(timeZone)) {
    return new Date(wall.y, wall.m - 1, wall.d, wall.h, wall.mi, wall.s);
  }
  const guess = Date.UTC(wall.y, wall.m - 1, wall.d, wall.h, wall.mi, wall.s);
  const first = guess - offsetAt(guess, timeZone);
  return new Date(guess - offsetAt(first, timeZone));
}

function daysIn(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addDays(w: Wall, n: number): Wall {
  const t = new Date(Date.UTC(w.y, w.m - 1, w.d + n));
  return { ...w, y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function nth(first: Wall, rule: RepeatRule, n: number): Wall {
  switch (rule) {
    case 'daily':
      return addDays(first, n);
    case 'weekly':
      return addDays(first, 7 * n);
    case 'monthly': {
      const total = first.m - 1 + n;
      const y = first.y + Math.floor(total / 12);
      const m = (total % 12) + 1;
      return { ...first, y, m, d: Math.min(first.d, daysIn(y, m)) };
    }
    case 'yearly': {
      const y = first.y + n;
      return { ...first, y, d: Math.min(first.d, daysIn(y, first.m)) };
    }
  }
}

export function dayKey(w: Pick<Wall, 'y' | 'm' | 'd'>): string {
  return `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
}

/** A starting index a little before `from`, so a long series is not walked from the start. */
function indexNear(rule: RepeatRule, start: number, from: number): number {
  const gap = from - start;
  if (gap <= 0) return 0;
  const unit =
    rule === 'daily' ? DAY_MS : rule === 'weekly' ? 7 * DAY_MS : rule === 'monthly' ? 31 * DAY_MS : 366 * DAY_MS;
  return Math.max(0, Math.floor(gap / unit) - 2);
}

const toMs = (value: string | Date) => (value instanceof Date ? value.getTime() : Date.parse(value));

/**
 * Every occurrence that overlaps [from, to], soonest first.
 *
 * A one-off event is a series of one, so a caller never has to ask which kind
 * it has.
 */
export function occurrencesBetween(series: Series, from: Date, to: Date, limit = 500): Occurrence[] {
  const start = toMs(series.startsAt);
  const duration = series.endsAt ? Math.max(0, toMs(series.endsAt) - start) : null;
  const tz = series.repeatTimeZone ?? null;
  const first = wallTime(new Date(start), tz);

  if (!series.repeat) {
    const end = start + (duration ?? 0);
    if (end < from.getTime() || start > to.getTime()) return [];
    return [
      {
        index: 0,
        day: dayKey(first),
        startsAt: new Date(start),
        endsAt: duration !== null ? new Date(end) : null,
      },
    ];
  }

  const until = series.repeatUntil ? dayKey(wallTime(new Date(toMs(series.repeatUntil)), tz)) : null;
  const skips = new Set(series.repeatSkips ?? []);
  const found: Occurrence[] = [];

  let n = indexNear(series.repeat, start + (duration ?? 0), from.getTime());
  for (let step = 0; step < MAX_STEPS && found.length < limit; step++, n++) {
    const wall = nth(first, series.repeat, n);
    const day = dayKey(wall);
    if (until && day > until) break;

    const at = instantOf(wall, tz).getTime();
    if (at > to.getTime()) break;

    const end = at + (duration ?? 0);
    if (end < from.getTime() || skips.has(day)) continue;

    found.push({
      index: n,
      day,
      startsAt: new Date(at),
      endsAt: duration !== null ? new Date(end) : null,
    });
  }
  return found;
}

/** The first occurrence that starts after `after`, or null when the series is over. */
export function nextOccurrence(series: Series, after: Date): Occurrence | null {
  const far = new Date(8.64e15);
  const candidates = occurrencesBetween(series, after, far, 3);
  return candidates.find((o) => o.startsAt.getTime() > after.getTime()) ?? null;
}

/**
 * When the reminder for this series should next go off: the first occurrence
 * whose reminder time is still ahead of `now`, minus the minutes before.
 *
 * For a one-off event this is simply the start minus the minutes - even when
 * that has passed, so the worker can see it and drop it as late.
 */
export function nextReminderAt(series: Series, minutesBefore: number, now: Date): Date | null {
  const lead = minutesBefore * 60_000;
  if (!series.repeat) return new Date(toMs(series.startsAt) - lead);
  const next = nextOccurrence(series, new Date(now.getTime() + lead));
  return next ? new Date(next.startsAt.getTime() - lead) : null;
}
