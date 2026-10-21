import { instantOf, wallTime, type RepeatRule } from '../../common/recurrence';

/**
 * A family's events as iCalendar text (RFC 5545) - what Google Calendar,
 * Apple Calendar and Outlook subscribe to.
 *
 * Only what the phone's calendar needs to show an entry: the title, the time,
 * where it repeats, and a line of description. No photographs, no comments,
 * no names of who can see it - the feed is a pointer back into the app, not a
 * copy of the chronicle.
 *
 * A repeating series goes out as one VEVENT with an RRULE, in its own zone
 * (TZID), so the calendar keeps it at 18:00 through the clock changes the same
 * way common/recurrence.ts does. The rules that differ from the RFC's own
 * defaults are spelled out: a monthly series on the 31st means "the last day"
 * in a short month here, and the RFC would skip that month instead.
 */

export interface IcsEvent {
  id: string;
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  allDay: boolean;
  repeat?: RepeatRule | null;
  repeatUntil?: Date | null;
  repeatSkips?: readonly string[] | null;
  repeatTimeZone?: string | null;
  updatedAt: Date;
}

export interface IcsBirthday {
  memberId: string;
  /** Already in the reader's language: "Birthday: Anna". */
  summary: string;
  birthDate: Date;
}

const CRLF = '\r\n';

/** Backslash, semicolon, comma and line breaks, as TEXT values need them. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Lines longer than 75 octets are folded: a line break and one space. Octets,
 * not characters - "ā" is two of them, and a fold in the middle of one breaks
 * the character in half for every reader that follows the RFC.
 */
export function fold(line: string): string {
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char, 'utf8');
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (size + bytes > limit) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join(`${CRLF} `);
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** 20261020T150000Z */
export function utcStamp(at: Date): string {
  return (
    `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}` +
    `T${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}Z`
  );
}

function localStamp(at: Date, timeZone: string): string {
  const w = wallTime(at, timeZone);
  return `${w.y}${pad(w.m)}${pad(w.d)}T${pad(w.h)}${pad(w.mi)}${pad(w.s)}`;
}

/** The calendar date an all-day event is on, as the family wrote it. */
function dateStamp(at: Date, timeZone: string | null | undefined): string {
  const w = wallTime(at, timeZone ?? 'UTC');
  return `${w.y}${pad(w.m)}${pad(w.d)}`;
}

function nextDateStamp(at: Date, timeZone: string | null | undefined): string {
  const w = wallTime(at, timeZone ?? 'UTC');
  const next = new Date(Date.UTC(w.y, w.m - 1, w.d + 1));
  return `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`;
}

/**
 * RRULE for a rule, including the two cases where "the same day" needs saying:
 * the 29th-31st of a month, and 29 February.
 */
export function rrule(event: Pick<IcsEvent, 'repeat' | 'startsAt' | 'repeatUntil' | 'repeatTimeZone' | 'allDay'>): string | null {
  if (!event.repeat) return null;
  const zone = event.repeatTimeZone ?? 'UTC';
  const first = wallTime(event.startsAt, zone);

  const parts: string[] = [`FREQ=${event.repeat.toUpperCase()}`];
  if (event.repeat === 'monthly' && first.d > 28) {
    const days = Array.from({ length: first.d - 27 }, (_, i) => 28 + i).join(',');
    parts.push(`BYMONTHDAY=${days}`, 'BYSETPOS=-1');
  }
  if (event.repeat === 'yearly' && first.m === 2 && first.d === 29) {
    parts.push('BYMONTH=2', 'BYMONTHDAY=28,29', 'BYSETPOS=-1');
  }

  if (event.repeatUntil) {
    const lastDay = wallTime(event.repeatUntil, zone);
    if (event.allDay) {
      parts.push(`UNTIL=${lastDay.y}${pad(lastDay.m)}${pad(lastDay.d)}`);
    } else {
      // The end of that day in the series' zone, in UTC as the RFC requires
      // next to a TZID start - so an occurrence on the last day still counts.
      const end = instantOf({ ...lastDay, h: 23, mi: 59, s: 59 }, zone);
      parts.push(`UNTIL=${utcStamp(end)}`);
    }
  }
  return `RRULE:${parts.join(';')}`;
}

function eventLines(event: IcsEvent, now: Date): string[] {
  const zone = event.repeat && event.repeatTimeZone ? event.repeatTimeZone : null;
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id}@famstory`,
    `DTSTAMP:${utcStamp(now)}`,
    `LAST-MODIFIED:${utcStamp(event.updatedAt)}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(event.startsAt, event.repeatTimeZone)}`);
    lines.push(`DTEND;VALUE=DATE:${nextDateStamp(event.endsAt ?? event.startsAt, event.repeatTimeZone)}`);
  } else if (zone) {
    lines.push(`DTSTART;TZID=${zone}:${localStamp(event.startsAt, zone)}`);
    if (event.endsAt) lines.push(`DTEND;TZID=${zone}:${localStamp(event.endsAt, zone)}`);
  } else {
    lines.push(`DTSTART:${utcStamp(event.startsAt)}`);
    if (event.endsAt) lines.push(`DTEND:${utcStamp(event.endsAt)}`);
  }

  const rule = rrule(event);
  if (rule) lines.push(rule);

  for (const day of event.repeatSkips ?? []) {
    const [y, m, d] = day.split('-').map(Number);
    if (event.allDay) {
      lines.push(`EXDATE;VALUE=DATE:${y}${pad(m)}${pad(d)}`);
    } else {
      const time = wallTime(event.startsAt, zone ?? 'UTC');
      const skipped = instantOf({ ...time, y, m, d }, zone ?? 'UTC');
      lines.push(zone ? `EXDATE;TZID=${zone}:${localStamp(skipped, zone)}` : `EXDATE:${utcStamp(skipped)}`);
    }
  }

  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  lines.push('END:VEVENT');
  return lines;
}

function birthdayLines(birthday: IcsBirthday, now: Date): string[] {
  const born = wallTime(birthday.birthDate, 'UTC');
  const leapDay = born.m === 2 && born.d === 29;
  return [
    'BEGIN:VEVENT',
    `UID:birthday-${birthday.memberId}@famstory`,
    `DTSTAMP:${utcStamp(now)}`,
    `SUMMARY:${escapeText(birthday.summary)}`,
    `DTSTART;VALUE=DATE:${dateStamp(birthday.birthDate, 'UTC')}`,
    `DTEND;VALUE=DATE:${nextDateStamp(birthday.birthDate, 'UTC')}`,
    leapDay ? 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1' : 'RRULE:FREQ=YEARLY',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

export function buildCalendar(input: {
  name: string;
  events: IcsEvent[];
  birthdays: IcsBirthday[];
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FamStory//Family calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(input.name)}`,
    // How often to look again. Calendars treat this as a hint; Google's own
    // schedule is longer whatever it says.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...input.events.flatMap((event) => eventLines(event, now)),
    ...input.birthdays.flatMap((birthday) => birthdayLines(birthday, now)),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}
