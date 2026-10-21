import type { Attachment, CategoryId, FamilyEvent } from './types';

/**
 * A MONTH, LOOKED BACK ON (docs/07-IMPROVEMENTS.md item 10).
 *
 * "Your September, in nine photographs." Aggregation only - counting, and
 * choosing which photographs - with no model and nothing leaving the phone,
 * which is the MVP's rule for anything that sounds like AI.
 *
 * Built from the events this person can see (the caller passes the visible
 * list and nothing else), so a recap can never be where a hidden event shows.
 * A series counts once, in the month it began: a weekly practice is not four
 * memories.
 */

export const RECAP_PHOTOS = 9;
/** The recap of last month is offered this many days into the new one. */
export const RECAP_DAYS = 7;

export interface MonthRecap {
  /** The first day of the month, local. */
  month: Date;
  events: FamilyEvent[];
  photos: Attachment[];
  milestones: number;
  /** Who was in it most, most first. */
  people: { memberId: string; count: number }[];
  /** What kind of month it was, largest first. */
  kinds: { categoryId: CategoryId; count: number }[];
}

export function monthRecap(visible: readonly FamilyEvent[], month: Date): MonthRecap {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);

  const events = visible
    .filter((e) => {
      const at = new Date(e.startsAt).getTime();
      return at >= start.getTime() && at < end.getTime();
    })
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));

  const people = new Map<string, number>();
  const kinds = new Map<CategoryId, number>();
  for (const event of events) {
    for (const id of event.participantMemberIds) people.set(id, (people.get(id) ?? 0) + 1);
    kinds.set(event.categoryId, (kinds.get(event.categoryId) ?? 0) + 1);
  }

  return {
    month: start,
    events,
    photos: pickPhotos(events),
    milestones: events.filter((e) => e.isMilestone).length,
    people: [...people.entries()]
      .map(([memberId, count]) => ({ memberId, count }))
      .sort((a, b) => b.count - a.count),
    kinds: [...kinds.entries()]
      .map(([categoryId, count]) => ({ categoryId, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Nine photographs, spread across the month rather than the first nine: one
 * from each event in turn, then a second from each, so a holiday with forty
 * pictures does not crowd out the birthday with one.
 */
function pickPhotos(events: FamilyEvent[]): Attachment[] {
  const withPhotos = events
    .map((e) => e.attachments.filter((a) => a.kind === 'image'))
    .filter((list) => list.length > 0);

  const picked: Attachment[] = [];
  for (let round = 0; picked.length < RECAP_PHOTOS; round++) {
    let added = false;
    for (const list of withPhotos) {
      if (list[round] && picked.length < RECAP_PHOTOS) {
        picked.push(list[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return picked;
}

/**
 * Which month to offer, if any: last month, in the first RECAP_DAYS of this
 * one, when anything happened in it. Null the rest of the time - a recap
 * waiting all month becomes wallpaper.
 */
export function recapToOffer(visible: readonly FamilyEvent[], now: Date = new Date()): Date | null {
  if (now.getDate() > RECAP_DAYS) return null;
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return monthRecap(visible, last).events.length > 0 ? last : null;
}

/** "2026-09", for a route and for analytics. */
export function monthKey(month: Date): string {
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
}

export function parseMonthKey(key: string | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key ?? '');
  if (!match) return null;
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return null;
  return new Date(Number(match[1]), month, 1);
}
