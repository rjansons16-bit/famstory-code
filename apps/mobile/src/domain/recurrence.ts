import type { FamilyEvent, RepeatRule } from './types';

export type { RepeatRule };

/**
 * REPEATING EVENTS - when the occurrences of a series fall.
 *
 * The same algorithm as apps/api/src/common/recurrence.ts, and the same test
 * cases (recurrence.test.ts). Two copies is the debt docs/07-IMPROVEMENTS.md
 * item 11 describes; what keeps them honest meanwhile is that both suites
 * check the same dates.
 *
 * A series is one event with a `repeat` rule. Each occurrence is the first
 * one's LOCAL date and time in the series' own zone, moved on by whole days,
 * months or years, so "Tuesdays at 18:00" stays at 18:00 through the clock
 * changes. Counted from the first occurrence every time: a series on the 31st
 * is on the 30th in April and back on the 31st in May.
 */

export const REPEAT_RULES: readonly RepeatRule[] = ['daily', 'weekly', 'monthly', 'yearly'];

export interface Occurrence {
  index: number;
  /** Its local day in the series' zone, YYYY-MM-DD - what a skip names. */
  day: string;
  startsAt: string;
  endsAt?: string;
}

type SeriesLike = Pick<
  FamilyEvent,
  'startsAt' | 'endsAt' | 'repeat' | 'repeatUntil' | 'repeatSkips' | 'repeatTimeZone'
>;

interface Wall {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

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
      formatters.set(timeZone, null);
    }
  }
  return formatters.get(timeZone) ?? null;
}

/** The zone this device is in - what a new series is kept in. */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function localWall(instant: Date): Wall {
  return {
    y: instant.getFullYear(),
    m: instant.getMonth() + 1,
    d: instant.getDate(),
    h: instant.getHours(),
    mi: instant.getMinutes(),
    s: instant.getSeconds(),
  };
}

function wallTime(instant: Date, timeZone?: string | null): Wall {
  const formatter = timeZone ? formatterFor(timeZone) : null;
  if (!formatter) return localWall(instant);
  try {
    const parts = formatter.formatToParts(instant);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value ?? 0);
    return {
      y: get('year'),
      m: get('month'),
      d: get('day'),
      h: get('hour') % 24,
      mi: get('minute'),
      s: get('second'),
    };
  } catch {
    // An engine with the constructor but not formatToParts: this device's own.
    return localWall(instant);
  }
}

function offsetAt(ms: number, timeZone: string): number {
  const w = wallTime(new Date(ms), timeZone);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

function instantOf(wall: Wall, timeZone?: string | null): Date {
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

function dayKey(w: Pick<Wall, 'y' | 'm' | 'd'>): string {
  return `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
}

/** YYYY-MM-DD of an instant in a zone (the device's own without one). */
export function localDay(iso: string, timeZone?: string | null): string {
  return dayKey(wallTime(new Date(iso), timeZone));
}

function indexNear(rule: RepeatRule, start: number, from: number): number {
  const gap = from - start;
  if (gap <= 0) return 0;
  const unit =
    rule === 'daily'
      ? DAY_MS
      : rule === 'weekly'
        ? 7 * DAY_MS
        : rule === 'monthly'
          ? 31 * DAY_MS
          : 366 * DAY_MS;
  return Math.max(0, Math.floor(gap / unit) - 2);
}

/** Every occurrence that overlaps [from, to], soonest first. A one-off is a series of one. */
export function occurrencesBetween(
  series: SeriesLike,
  from: Date,
  to: Date,
  limit = 500,
): Occurrence[] {
  const start = Date.parse(series.startsAt);
  const duration = series.endsAt ? Math.max(0, Date.parse(series.endsAt) - start) : null;
  const tz = series.repeatTimeZone ?? null;
  const first = wallTime(new Date(start), tz);

  if (!series.repeat) {
    const end = start + (duration ?? 0);
    if (end < from.getTime() || start > to.getTime()) return [];
    return [{ index: 0, day: dayKey(first), startsAt: series.startsAt, endsAt: series.endsAt }];
  }

  const until = series.repeatUntil ? dayKey(wallTime(new Date(series.repeatUntil), tz)) : null;
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
      startsAt: new Date(at).toISOString(),
      endsAt: duration !== null ? new Date(end).toISOString() : undefined,
    });
  }
  return found;
}

/** The first occurrence that starts after `after`, or null when the series is over. */
export function nextOccurrence(series: SeriesLike, after: Date): Occurrence | null {
  const candidates = occurrencesBetween(series, after, new Date(8.64e15), 3);
  return candidates.find((o) => Date.parse(o.startsAt) > after.getTime()) ?? null;
}

/** One occurrence as an event of its own, for the screens that draw days. */
export function asOccurrence(event: FamilyEvent, occurrence: Occurrence): FamilyEvent {
  return {
    ...event,
    startsAt: occurrence.startsAt,
    endsAt: occurrence.endsAt,
    occurrenceDay: event.repeat ? occurrence.day : undefined,
  };
}

/**
 * Events spread over a range: a one-off as it is, a series as one copy per
 * occurrence that falls in it. What the calendar's grid and day list read.
 */
export function expandBetween(events: readonly FamilyEvent[], from: Date, to: Date): FamilyEvent[] {
  return events.flatMap((event) => {
    if (!event.repeat) return [event];
    return occurrencesBetween(event, from, to).map((o) => asOccurrence(event, o));
  });
}

/**
 * Where a series sits in the timeline: at its next occurrence from the start
 * of today - so this evening's practice is under "Today" - or, once it is
 * over, at its last one. A one-off stays where it is.
 *
 * Once, not thirty times: the timeline is a chronicle, and a weekly practice
 * spelled out week by week would bury everything else in it.
 */
export function timelinePlace(event: FamilyEvent, now: Date = new Date()): FamilyEvent {
  if (!event.repeat) return event;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = nextOccurrence(event, new Date(today.getTime() - 1));
  if (next) return asOccurrence(event, next);

  // Over: the last one there was. Walk back from its end a year at a time.
  const end = event.repeatUntil ? new Date(event.repeatUntil) : now;
  for (let years = 1; years <= 50; years++) {
    const from = new Date(end.getTime() - years * 366 * DAY_MS);
    const found = occurrencesBetween(event, from, end, 5000);
    if (found.length > 0) return asOccurrence(event, found[found.length - 1]);
  }
  return event;
}

/** The day before an occurrence's day, for "stop repeating from here". */
export function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return dayKey({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

/** A day as the instant the server keeps a series' last day as: noon, local. */
export function dayAsInstant(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
}
