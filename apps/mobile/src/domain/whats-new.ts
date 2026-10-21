import type { FamilyEvent } from './types';

/**
 * WHAT CHANGED SINCE YOU LAST LOOKED.
 *
 * A family timeline is sorted by when things happened, which is right for a
 * chronicle and useless for the question a person opening the app actually
 * has: "what did the others add?" A grandmother's photograph of 1974 goes in
 * fifty years down the list, and nobody scrolls there to find it.
 *
 * So "new" is measured by when an event was ADDED, against the moment the
 * previous visit began - which the server keeps (`Member.lastSeenAt`), so it
 * holds across a new phone and a cleared browser. A first visit has nothing to
 * compare with and shows nothing: everything would be new, which says nothing.
 *
 * Three things are never new:
 *   - your own events - you know what you added;
 *   - one you have opened since - it has been seen;
 *   - anything you cannot see - the list passed in is the visible one, and this
 *     function must never be handed anything else (see useWhatsNew).
 */

/** A visit is over after this long away; coming back after that starts a new one. */
export const VISIT_GAP_MS = 30 * 60_000;

export function newSinceLastVisit(
  visibleEvents: readonly FamilyEvent[],
  options: {
    /** When the previous visit began, or null on a first visit. */
    since: string | null;
    /** Whose "new" this is. */
    memberId: string | undefined;
    /** Events opened during this visit. */
    opened: readonly string[];
  },
): FamilyEvent[] {
  if (!options.since || !options.memberId) return [];
  const since = Date.parse(options.since);
  if (Number.isNaN(since)) return [];

  return visibleEvents.filter(
    (event) =>
      event.authorMemberId !== options.memberId &&
      Date.parse(event.createdAt) > since &&
      !options.opened.includes(event.id),
  );
}
