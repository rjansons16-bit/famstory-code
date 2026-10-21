/**
 * Account rules the app has to state out loud.
 *
 * The server is the authority (apps/api/src/common/deletion.ts); this is here
 * so the sentence a person reads before pressing "Delete account" cannot drift
 * away from the rule that will actually be applied to their data.
 */

/** How long a deleted account can still be brought back by signing in. */
export const DELETION_GRACE_DAYS = 30;
