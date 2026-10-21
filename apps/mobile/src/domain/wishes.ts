import type { Wish } from './types';

/**
 * WHAT A WISH LIST SHOWS TO WHOM.
 *
 * The person a list is for sees only the lines they wrote themselves, and
 * never who is getting what; everybody else sees every line and every claim.
 * The server enforces this (apps/api/src/modules/wishes/wishes.service.ts) and
 * never sends the owner the rest. This is the same rule for the sample family,
 * which has no server - so the demo cannot show a grandmother her surprise.
 */
export function wishesVisibleTo(
  list: readonly Wish[],
  forMemberId: string,
  viewerId: string | undefined,
): Wish[] {
  if (!viewerId) return [];
  if (viewerId !== forMemberId) return [...list];
  return list
    .filter((wish) => wish.addedByMemberId === viewerId)
    .map((wish) => ({ ...wish, claimedByMemberId: null }));
}

/** Who may press "I'll get this" on a line: anybody but the person it is for. */
export function mayClaim(wish: Wish, forMemberId: string, viewerId: string | undefined): boolean {
  if (!viewerId || viewerId === forMemberId) return false;
  return wish.claimedByMemberId === null || wish.claimedByMemberId === viewerId;
}

export const MAX_WISH_LENGTH = 200;
