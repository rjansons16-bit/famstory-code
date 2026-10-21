import { buildCalendar, escapeText, fold, rrule, utcStamp, type IcsEvent } from './ics';

/**
 * The feed is read by software we do not control, so the tests check the
 * text itself: the rules a calendar would silently misread, and the one
 * character set (Latvian) that line folding usually gets wrong.
 */

const RIGA = 'Europe/Riga';

function event(patch: Partial<IcsEvent> = {}): IcsEvent {
  return {
    id: 'evt_1',
    title: 'Football',
    startsAt: new Date('2026-10-20T15:00:00.000Z'),
    endsAt: new Date('2026-10-20T16:30:00.000Z'),
    allDay: false,
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    ...patch,
  };
}

describe('Text in a calendar', () => {
  it('escapes what iCalendar reads as structure', () => {
    expect(escapeText('Tea, cake; and\nsongs \\o/')).toBe('Tea\\, cake\\; and\\nsongs \\\\o/');
  });

  it('folds long lines by octets, never inside a Latvian letter', () => {
    const line = `SUMMARY:${'ā'.repeat(100)}`;
    const folded = fold(line).split('\r\n');

    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded) expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
    // Unfolding (drop CRLF + the one space) gives back exactly what went in.
    expect(fold(line).replace(/\r\n /g, '')).toBe(line);
  });

  it('writes UTC stamps in the basic format', () => {
    expect(utcStamp(new Date('2026-10-20T15:00:00.000Z'))).toBe('20261020T150000Z');
  });
});

describe('Repeating rules', () => {
  it('weekly, until the end of the last day in its own zone', () => {
    const rule = rrule(
      event({ repeat: 'weekly', repeatTimeZone: RIGA, repeatUntil: new Date('2026-12-22T12:00:00Z') }),
    );
    // 23:59:59 on 22 December in Riga (UTC+2) is 21:59:59 UTC.
    expect(rule).toBe('RRULE:FREQ=WEEKLY;UNTIL=20261222T215959Z');
  });

  it('the 31st means the last day of a shorter month, not a skipped one', () => {
    const rule = rrule(event({ repeat: 'monthly', startsAt: new Date('2027-01-31T10:00:00Z'), repeatTimeZone: RIGA }));
    expect(rule).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1');
  });

  it('a day of the month every month has needs nothing extra', () => {
    expect(rrule(event({ repeat: 'monthly', startsAt: new Date('2027-01-15T10:00:00Z') }))).toBe(
      'RRULE:FREQ=MONTHLY',
    );
  });

  it('29 February falls back to the 28th', () => {
    const rule = rrule(event({ repeat: 'yearly', startsAt: new Date('2028-02-29T10:00:00Z'), allDay: true }));
    expect(rule).toBe('RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1');
  });

  it('a one-off has no rule', () => {
    expect(rrule(event())).toBeNull();
  });
});

describe('The whole feed', () => {
  const now = new Date('2026-10-01T12:00:00.000Z');

  it('keeps a series in its zone and leaves out a skipped week', () => {
    const text = buildCalendar({
      name: 'The Bergs',
      events: [event({ repeat: 'weekly', repeatTimeZone: RIGA, repeatSkips: ['2026-10-27'] })],
      birthdays: [],
      now,
    });

    expect(text).toContain('DTSTART;TZID=Europe/Riga:20261020T180000');
    expect(text).toContain('DTEND;TZID=Europe/Riga:20261020T193000');
    // The skipped Tuesday, at its own local time - 18:00, although the
    // clocks have gone back by then.
    expect(text).toContain('EXDATE;TZID=Europe/Riga:20261027T180000');
  });

  it('writes an all-day event as dates, the day after as its end', () => {
    const text = buildCalendar({
      name: 'The Bergs',
      events: [event({ allDay: true, startsAt: new Date('2026-09-01T09:00:00Z'), endsAt: null })],
      birthdays: [],
      now,
    });
    expect(text).toContain('DTSTART;VALUE=DATE:20260901');
    expect(text).toContain('DTEND;VALUE=DATE:20260902');
  });

  it('adds a yearly all-day entry per birthday', () => {
    const text = buildCalendar({
      name: 'The Bergs',
      events: [],
      birthdays: [{ memberId: 'mem_vera', summary: 'Birthday: Vera', birthDate: new Date('1950-11-20T10:00:00Z') }],
      now,
    });
    expect(text).toContain('UID:birthday-mem_vera@famstory');
    expect(text).toContain('SUMMARY:Birthday: Vera');
    expect(text).toContain('DTSTART;VALUE=DATE:19501120');
    expect(text).toContain('RRULE:FREQ=YEARLY');
  });

  it('is CRLF throughout and opens and closes the calendar', () => {
    const text = buildCalendar({ name: 'X', events: [event()], birthdays: [], now });
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/\n/);
  });
});
