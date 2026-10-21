import { asOccurrence, occurrencesBetween } from './recurrence';
import type { FamilyEvent } from './types';

/**
 * SCHEDULE CONFLICTS - does anybody in this event already have something then?
 *
 * The same rules as the server's AiService.detectConflicts, so the composer
 * warns offline and in the demo and says the same thing the server would:
 *   - only events the person can see: the caller passes `useVisibleEvents()`,
 *     never the raw store, because a warning built from a hidden event gives
 *     that event away;
 *   - all-day events never conflict - a birthday is not a double booking;
 *   - an event with no end is taken to last an hour, on both sides;
 *   - a repeating series conflicts at each of its occurrences, and a skipped
 *     week is free.
 *
 * It only says. The composer shows it as a suggestion with a way to change
 * the time and a way to keep it; nothing moves by itself.
 */

/** How long an event with no end is taken to last. */
export const ASSUMED_DURATION_MS = 60 * 60 * 1000;

/** At most this many clashing events are named - a warning, not a list. */
const MAX_NAMED = 3;

export interface ConflictDraft {
  /** The event being edited, which does not conflict with itself. */
  id?: string;
  startsAt: string;
  endsAt?: string;
  allDay: boolean;
  participantMemberIds: readonly string[];
}

export interface Conflict {
  /** What it runs into, soonest first - as the occurrence that clashes. */
  events: FamilyEvent[];
  /** Which of the chosen people are in both. */
  memberIds: string[];
}

function endOf(startsAt: string, endsAt?: string): number {
  return endsAt ? Date.parse(endsAt) : Date.parse(startsAt) + ASSUMED_DURATION_MS;
}

export function findConflict(
  visible: readonly FamilyEvent[],
  draft: ConflictDraft,
): Conflict | null {
  if (draft.allDay || draft.participantMemberIds.length === 0) return null;

  const start = Date.parse(draft.startsAt);
  if (Number.isNaN(start)) return null;
  const end = endOf(draft.startsAt, draft.endsAt);
  if (end <= start) return null;

  const wanted = new Set(draft.participantMemberIds);
  const clashes: FamilyEvent[] = [];

  for (const other of visible) {
    if (other.id === draft.id || other.allDay) continue;
    if (!other.participantMemberIds.some((id) => wanted.has(id))) continue;

    // An open end is an hour here as well, so a series' occurrences carry it.
    const lasting = { ...other, endsAt: other.endsAt ?? new Date(endOf(other.startsAt)).toISOString() };
    const hit = occurrencesBetween(lasting, new Date(start), new Date(end), 5).find(
      (o) => Date.parse(o.startsAt) < end && endOf(o.startsAt, o.endsAt) > start,
    );
    // The copy that is named keeps the event's own open end: what the card
    // would show, not the hour assumed for the arithmetic.
    if (hit) clashes.push(asOccurrence(other, { ...hit, endsAt: other.endsAt ? hit.endsAt : undefined }));
  }

  if (clashes.length === 0) return null;

  clashes.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id));
  const events = clashes.slice(0, MAX_NAMED);

  // In the order they were chosen, which is the order the composer shows them.
  const inThem = new Set(events.flatMap((e) => e.participantMemberIds));
  const memberIds = draft.participantMemberIds.filter((id) => inThem.has(id));

  return { events, memberIds };
}

/**
 * A key for "this same warning". Dismissing it holds until the clash itself
 * changes - another event, another person - not until the next keystroke.
 */
export function conflictKey(conflict: Conflict): string {
  return [
    conflict.events.map((e) => `${e.id}@${e.occurrenceDay ?? ''}`).join(','),
    conflict.memberIds.join(','),
  ].join('|');
}
