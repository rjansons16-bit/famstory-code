import type { FamilyEvent } from './types';

/**
 * THE YEAR IN A MINUTE (docs/07-IMPROVEMENTS.md item 81).
 *
 * A minute of the family's year, made on the device from what is already in
 * it: photographs with their titles, and a few seconds of a voice where there
 * is one. Nothing is sent anywhere to make it; in the browser it can be saved
 * as a video to send the grandparents or to post - which is also how a family
 * app gets seen by families who do not have it yet.
 */

export const FILM_SLIDES = 20;
/** Twenty slides of three seconds: a minute. */
export const SLIDE_SECONDS = 3;

export interface Slide {
  eventId: string;
  title: string;
  startsAt: string;
  photoUrl: string;
  /** A voice from the same event, played under its slide. */
  voiceUrl?: string;
  isMilestone: boolean;
}

function photoOf(event: FamilyEvent): string | undefined {
  const cover = event.attachments.find((a) => a.kind === 'image');
  return cover ? (cover.url ?? cover.thumbnailUrl) : undefined;
}

/**
 * The slides for one year: every entry of that year with a photograph, never
 * a closed capsule or an unrevealed surprise. More than fit, and the
 * milestones go in first, then the rest spread across the months - a film
 * that is all August is a film about August - and the result plays in order.
 */
export function yearFilm(events: readonly FamilyEvent[], year: number, now: Date = new Date()): Slide[] {
  const candidates = events
    .filter((e) => new Date(e.startsAt).getFullYear() === year && Date.parse(e.startsAt) <= now.getTime())
    .filter((e) => !e.sealed && !(e.sealedUntil && Date.parse(e.sealedUntil) > now.getTime()))
    .filter((e) => !(e.hiddenFromMemberId && e.revealAt && Date.parse(e.revealAt) > now.getTime()))
    .filter((e) => !e.occurrenceDay && photoOf(e));

  let chosen = candidates;
  if (candidates.length > FILM_SLIDES) {
    const milestones = candidates.filter((e) => e.isMilestone).slice(0, FILM_SLIDES);
    const byMonth = new Map<number, FamilyEvent[]>();
    for (const e of candidates) {
      if (e.isMilestone) continue;
      const month = new Date(e.startsAt).getMonth();
      byMonth.set(month, [...(byMonth.get(month) ?? []), e]);
    }
    const rest: FamilyEvent[] = [];
    // One from each month in turn, until the film is full.
    while (milestones.length + rest.length < FILM_SLIDES && [...byMonth.values()].some((l) => l.length)) {
      for (const list of byMonth.values()) {
        const next = list.shift();
        if (next && milestones.length + rest.length < FILM_SLIDES) rest.push(next);
      }
    }
    chosen = [...milestones, ...rest];
  }

  return [...chosen]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((e) => ({
      eventId: e.id,
      title: e.title,
      startsAt: e.startsAt,
      photoUrl: photoOf(e) as string,
      voiceUrl: e.voiceNotes?.[0]?.url,
      isMilestone: e.isMilestone,
    }));
}

/** The year the film offers: this one, or last year's in January when this one has barely begun. */
export function filmYear(events: readonly FamilyEvent[], now: Date = new Date()): number {
  const year = now.getFullYear();
  if (yearFilm(events, year, now).length >= 3 || now.getMonth() > 0) return year;
  return year - 1;
}
