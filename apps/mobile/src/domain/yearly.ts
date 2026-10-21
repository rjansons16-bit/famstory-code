import type { Attachment, FamilyEvent, Member } from './types';

/**
 * YEAR AFTER YEAR (docs/07-IMPROVEMENTS.md items 79 and 80).
 *
 * The first day of school every September, Midsummer every June, the same
 * cake on the same birthday. Nothing new is stored: a tradition is something
 * the family has already named twice in two different years - the same tag,
 * or the same title once the year is taken out of it ("Jāņi 2024" and "Jāņi
 * 2025" are one thing). Growing up is the same, about one person.
 *
 * Closed time capsules and surprises not yet revealed never count: an
 * envelope has no photograph to show, and a surprise is not yet anybody's.
 */

export interface YearEntry {
  year: number;
  events: FamilyEvent[];
  /** The first photograph of that year's entries, when there is one. */
  cover?: Attachment;
  /** How old the person was that year, on the growing-up view. */
  age?: number;
}

export interface YearSeries {
  key: string;
  /** The family's own word for it, as they first wrote it. */
  label: string;
  years: YearEntry[];
}

/** Two years make a pattern; one is only an event. */
export const MIN_YEARS = 2;

/**
 * A title with the year and the punctuation taken out, lower-cased: "Jāņi
 * 2024!" and "jāņi 2025" are the same thing. Letters of every alphabet stay.
 * Too short to mean anything once stripped, and it is not a name for a series.
 */
export function normalizedTitle(title: string): string {
  const plain = title
    .toLocaleLowerCase()
    .replace(/\d+/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length >= 3 ? plain : '';
}

function yearOf(event: FamilyEvent): number {
  return new Date(event.startsAt).getFullYear();
}

function countable(event: FamilyEvent, now: Date): boolean {
  if (event.sealed) return false;
  if (event.sealedUntil && Date.parse(event.sealedUntil) > now.getTime()) return false;
  if (event.hiddenFromMemberId && event.revealAt && Date.parse(event.revealAt) > now.getTime()) return false;
  return Date.parse(event.startsAt) <= now.getTime();
}

function toSeries(key: string, label: string, events: FamilyEvent[], birthDate?: string): YearSeries {
  const byYear = new Map<number, FamilyEvent[]>();
  for (const event of events) {
    const year = yearOf(event);
    byYear.set(year, [...(byYear.get(year) ?? []), event]);
  }
  const born = birthDate ? new Date(birthDate).getFullYear() : undefined;

  const years = [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, list]) => {
      const sorted = [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      return {
        year,
        events: sorted,
        cover: sorted.find((e) => e.attachments.length > 0)?.attachments[0],
        ...(born !== undefined ? { age: year - born } : {}),
      };
    });

  return { key, label, years };
}

/**
 * Every series in these events: by tag first - the family's own label is the
 * better name - then by title. A title series whose events a tag series
 * already holds is the same thing named twice, and is dropped.
 */
export function yearSeries(
  events: readonly FamilyEvent[],
  now: Date = new Date(),
  birthDate?: string,
): YearSeries[] {
  const usable = events.filter((e) => countable(e, now) && !e.occurrenceDay);

  const byTag = new Map<string, { label: string; events: FamilyEvent[] }>();
  const byTitle = new Map<string, { label: string; events: FamilyEvent[] }>();
  for (const event of usable) {
    for (const tag of event.tags ?? []) {
      const key = tag.toLocaleLowerCase().trim();
      if (!key) continue;
      const group = byTag.get(key) ?? { label: tag.trim(), events: [] };
      group.events.push(event);
      byTag.set(key, group);
    }
    const title = normalizedTitle(event.title);
    if (title) {
      const group = byTitle.get(title) ?? { label: event.title.replace(/\d{4}/g, '').trim(), events: [] };
      group.events.push(event);
      byTitle.set(title, group);
    }
  }

  const spansYears = (list: FamilyEvent[]) => new Set(list.map(yearOf)).size >= MIN_YEARS;
  const tagged = [...byTag.entries()]
    .filter(([, g]) => spansYears(g.events))
    .map(([key, g]) => toSeries(`tag:${key}`, g.label, g.events, birthDate));
  const heldByATag = (list: FamilyEvent[]) =>
    tagged.some((series) => {
      const ids = new Set(series.years.flatMap((y) => y.events.map((e) => e.id)));
      return list.every((e) => ids.has(e.id));
    });
  const titled = [...byTitle.entries()]
    .filter(([, g]) => spansYears(g.events) && !heldByATag(g.events))
    .map(([key, g]) => toSeries(`title:${key}`, g.label, g.events, birthDate));

  const latest = (s: YearSeries) => s.years[s.years.length - 1].year;
  return [...tagged, ...titled].sort(
    (a, b) => latest(b) - latest(a) || b.years.length - a.years.length || a.label.localeCompare(b.label),
  );
}

/** The family's traditions: what it has done again and again, across years. */
export function traditions(events: readonly FamilyEvent[], now: Date = new Date()): YearSeries[] {
  return yearSeries(events, now);
}

/** One person growing up: the same moment of theirs, year after year, with their age. */
export function growingUp(
  events: readonly FamilyEvent[],
  member: Member,
  now: Date = new Date(),
): YearSeries[] {
  return yearSeries(
    events.filter((e) => e.participantMemberIds.includes(member.id)),
    now,
    member.birthDate,
  );
}
