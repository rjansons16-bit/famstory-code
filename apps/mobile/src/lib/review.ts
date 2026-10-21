/**
 * ASKING FOR A RATING - on a phone (./review.web.ts is the web).
 *
 * The research (docs/11-MARKETING.md §1) says to ask right after a good
 * moment, not at launch. The moment chosen: somebody has just saved the fifth
 * entry they wrote themselves - by then the app is part of how they keep the
 * family's days. It happens once per person, so nothing has to be remembered
 * on the phone (CLAUDE.md: the only thing kept there is the sign-in).
 *
 * The store decides whether the question appears at all (Apple shows it at
 * most three times a year) and never says whether it did, so the count is of
 * asking, not of answers. Only against a real server: the sample family is a
 * demo, not a family.
 */

import * as StoreReview from 'expo-store-review';

import { isLive } from '@/data/backend';
import { track } from '@/domain/analytics';

export const ASK_AFTER_OWN_EVENTS = 5;

export function askForReviewAfter(ownEvents: number): void {
  if (ownEvents !== ASK_AFTER_OWN_EVENTS || !isLive()) return;
  // On the timeline the composer goes back to, with the new entry on it -
  // not over the closing composer.
  setTimeout(() => {
    void (async () => {
      try {
        if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;
        await StoreReview.requestReview();
        track({ name: 'review_requested' });
      } catch {
        // A question the store would not ask is not an error anybody needs.
      }
    })();
  }, 1500);
}
