import { isSameDay } from '@/lib/date';
import { type Birthday, upcomingBirthdays } from './birthdays';
import type { FamilyEvent, Member } from './types';

/**
 * BIRTHDAY SURPRISES (docs/07-IMPROVEMENTS.md item 75).
 *
 * In the two weeks before somebody's birthday the rest of the family is asked
 * for a wish - a line, a photograph, a voice. Each wish is an event kept from
 * the one it is for (`hiddenFromMemberId`) until the morning of the day
 * (`revealAt`): the server enforces that, before every other visibility rule.
 * What is here is when to ask, and how to gather the wishes into one book once
 * they are theirs to read.
 *
 * Every wish is its own event, rather than a comment on one shared event, so
 * a wish can carry a photograph and a voice like anything else the family
 * keeps - and nobody has to be first to make "the" event.
 */

/** How far ahead the family is asked to write. */
export const SURPRISE_WINDOW_DAYS = 14;
/** Wishes are read in the morning. */
export const REVEAL_HOUR = 7;
/** How long after the day the book is still put in front of its person. */
export const BOOK_SHOWN_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SurpriseAsk {
  birthday: Birthday;
  /** When the wishes are shown: the morning of the day. */
  revealAt: string;
  /** What the family has written so far. */
  wishes: FamilyEvent[];
}

export interface SurpriseBook {
  revealAt: string;
  wishes: FamilyEvent[];
}

/** The morning of a birthday, when its wishes are shown. */
export function revealMoment(birthday: Birthday): Date {
  const at = new Date(birthday.day);
  at.setHours(REVEAL_HOUR, 0, 0, 0);
  return at;
}

/**
 * Whose birthday the family can still write for: the next two weeks, never the
 * viewer's own - they are the one it is kept from - and never a day whose
 * morning has already come.
 */
export function surprisesToAsk(
  members: Member[],
  events: readonly FamilyEvent[],
  viewerMemberId: string | undefined,
  now: Date = new Date(),
): SurpriseAsk[] {
  return upcomingBirthdays(members, { from: now, withinDays: SURPRISE_WINDOW_DAYS })
    .filter((birthday) => birthday.member.id !== viewerMemberId)
    .map((birthday) => {
      const at = revealMoment(birthday);
      return {
        birthday,
        revealAt: at.toISOString(),
        wishes: wishesFor(events, birthday.member.id, at),
      };
    })
    .filter((ask) => Date.parse(ask.revealAt) > now.getTime());
}

/** The wishes for one person's day - that day's only, so last year's stay last year's. */
export function wishesFor(
  events: readonly FamilyEvent[],
  memberId: string,
  day: Date,
): FamilyEvent[] {
  return events
    .filter(
      (e) => e.hiddenFromMemberId === memberId && !!e.revealAt && isSameDay(new Date(e.revealAt), day),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * The books waiting for this viewer: wishes written for them whose morning has
 * come, one book per birthday, newest first. A week on, the book is no longer
 * put in front of them - every wish stays in the chronicle all the same.
 */
export function booksFor(
  events: readonly FamilyEvent[],
  viewerMemberId: string | undefined,
  now: Date = new Date(),
): SurpriseBook[] {
  if (!viewerMemberId) return [];

  const books = new Map<string, SurpriseBook>();
  for (const event of events) {
    if (event.hiddenFromMemberId !== viewerMemberId || !event.revealAt) continue;
    const at = Date.parse(event.revealAt);
    if (at > now.getTime() || now.getTime() - at > BOOK_SHOWN_DAYS * DAY_MS) continue;

    const day = new Date(at).toDateString();
    const book = books.get(day) ?? { revealAt: event.revealAt, wishes: [] };
    book.wishes.push(event);
    books.set(day, book);
  }

  return [...books.values()]
    .map((book) => ({ ...book, wishes: book.wishes.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }))
    .sort((a, b) => b.revealAt.localeCompare(a.revealAt));
}

/** Still hidden from its person - worth saying so on the card, to everybody else. */
export function isPendingSurprise(
  event: Pick<FamilyEvent, 'hiddenFromMemberId' | 'revealAt'>,
  now: Date = new Date(),
): boolean {
  return !!event.hiddenFromMemberId && !!event.revealAt && Date.parse(event.revealAt) > now.getTime();
}
