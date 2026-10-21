/**
 * WHAT "DELETE MY ACCOUNT" MEANS HERE.
 *
 * Erasure (GDPR Art. 17) with a grace period, as docs/06-PRIVACY-GDPR.md and
 * the schema both specify. Pressing the button revokes every session and marks
 * the account deleted; the data goes for good 30 days later.
 *
 * The grace is not hedging. This is a family's only copy of years of
 * photographs and the only account that can reach them, deleted from a phone,
 * possibly by somebody upset - and there is no support desk to undo it. So
 * signing in during those 30 days brings the account back, which is the one
 * recovery route a person can find on their own.
 *
 * These live apart from the service that uses them because the sign-in path
 * needs the same rule, and a second copy of "30" in another module is how the
 * two quietly stop agreeing.
 */

export const DELETION_GRACE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a deleted account stops being recoverable and is erased. */
export function purgeDueAt(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + DELETION_GRACE_DAYS * DAY_MS);
}

/** Can this account still be brought back by signing in? */
export function withinGrace(deletedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() < purgeDueAt(deletedAt).getTime();
}

/** The oldest `deletedAt` that is still inside the grace period. */
export function purgeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - DELETION_GRACE_DAYS * DAY_MS);
}

/**
 * The name a member row carries once the person behind it is erased.
 *
 * The row itself stays: it is what the family's events, comments and
 * photographs are attached to, and deleting it would take a shared chronicle
 * apart to erase one person from it. What goes is everything personal - the
 * name, the face, the birthday, the link to an account.
 */
export const ANONYMISED_NAME = 'Former member';
