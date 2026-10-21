import { celebratedOn } from './birthdays';
import type { FamilyEvent, Member } from './types';

/**
 * TIME CAPSULES (docs/07-IMPROVEMENTS.md item 76).
 *
 * A letter to a child for the morning they turn eighteen; a voice for the
 * family to hear in ten years. Until its day everybody but the author sees
 * the envelope - the title, who sealed it and when it opens - and the server
 * sends nothing more (EventsService.present on the API). This file is only
 * what the app needs to draw the envelope and to suggest a day.
 */

/** The age a family writes on a child's envelope. */
export const COMING_OF_AGE = 18;

/** Capsules open in the morning, like presents. */
const OPENING_HOUR = 9;

/**
 * Is this copy an envelope for this viewer? When the server sent the event it
 * already said (`sealed`); the sample family has no server, so the rule is
 * kept here too - the same rule, never a looser one.
 */
export function isSealed(
  event: Pick<FamilyEvent, 'sealed' | 'sealedUntil' | 'authorMemberId'>,
  viewerMemberId: string | undefined,
  now: Date = new Date(),
): boolean {
  if (event.sealed) return true;
  return (
    !!event.sealedUntil &&
    Date.parse(event.sealedUntil) > now.getTime() &&
    event.authorMemberId !== viewerMemberId
  );
}

/** Still closed to somebody - including to everybody but the author who is looking. */
export function isClosedCapsule(event: Pick<FamilyEvent, 'sealedUntil'>, now: Date = new Date()): boolean {
  return !!event.sealedUntil && Date.parse(event.sealedUntil) > now.getTime();
}

export interface CapsuleOption {
  key: string;
  at: Date;
  /** A span of years from today... */
  years?: number;
  /** ...or a child's coming of age. */
  member?: Member;
}

/**
 * The days offered in the composer: a year, five and ten from today - and,
 * for every child with a birthday on the profile, the morning they turn
 * eighteen, when that is still ahead. Any other day is one tap further.
 */
export function capsuleOptions(members: Member[], now: Date = new Date()): CapsuleOption[] {
  const spans = [1, 5, 10].map((years) => {
    const at = new Date(now);
    at.setFullYear(at.getFullYear() + years);
    at.setHours(OPENING_HOUR, 0, 0, 0);
    return { key: `years-${years}`, at, years };
  });

  const comingOfAge = members
    .filter((m) => m.status === 'active' && m.role === 'child' && m.birthDate && !m.diedOn)
    .map((member) => {
      const born = new Date(member.birthDate as string);
      const at = celebratedOn(member.birthDate as string, born.getFullYear() + COMING_OF_AGE);
      at.setHours(OPENING_HOUR, 0, 0, 0);
      return { key: `adult-${member.id}`, at, member };
    })
    .filter((option) => option.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  return [...spans, ...comingOfAge];
}

/** A chosen day as the moment it opens: that morning. */
export function openingMoment(day: Date): Date {
  const at = new Date(day);
  at.setHours(OPENING_HOUR, 0, 0, 0);
  return at;
}
