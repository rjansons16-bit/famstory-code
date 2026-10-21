/**
 * Visibility and permission logic.
 *
 * This file is the core of the product. The feasibility study names it the main
 * differentiator ("privacy control within the family") and, at the same time,
 * the most critical regulatory risk ("protection of children's data").
 *
 * Two separate questions that MUST NOT be conflated:
 *   1. canSee()  — can this member see this event at all?
 *   2. can()     — does this member's role permit this action?
 *
 * IMPORTANT: on the client this logic is a UX convenience only. The server
 * checks it again (apps/api/src/modules/visibility). The client check is not a
 * security boundary.
 */

import type { Comment, FamilyEvent, Member, MemberRole, Visibility } from './types';

// ---------------------------------------------------------------------------
// 1. Visibility
// ---------------------------------------------------------------------------

/**
 * `blocked`: whom the viewer blocked (docs/02-DATA-MODEL.md, Blocks). What
 * they wrote is not shown to the viewer, whatever its audience.
 */
export function canSee(event: FamilyEvent, viewer: Member, blocked: readonly string[] = []): boolean {
  // A different family — never.
  if (event.familyId !== viewer.familyId) return false;

  // A removed member loses access to everything.
  if (viewer.status === 'removed') return false;

  // A surprise is kept from the one it is for until its morning - before every
  // other rule, the same order the server keeps (visibility.service.ts).
  if (
    event.hiddenFromMemberId === viewer.id &&
    (!event.revealAt || Date.parse(event.revealAt) > Date.now())
  ) {
    return false;
  }

  // Somebody the viewer blocked wrote it - beside the audience rules, as on
  // the server, so no audience brings it back. Nobody can block themselves.
  if (blocked.includes(event.authorMemberId)) return false;

  // The author always sees their own event.
  if (event.authorMemberId === viewer.id) return true;

  return matchesVisibility(event.visibility, viewer);
}

/**
 * What a block takes out of an event the viewer still sees: the blocked
 * members' reactions, and their comments from the count.
 *
 * The server sends events this way already. This is for the sample family,
 * and for the moment between pressing Block and the next load - counted from
 * the comments this device has, which is all it can know.
 */
export function withoutBlocked(
  event: FamilyEvent,
  blocked: readonly string[],
  comments: readonly Comment[],
): FamilyEvent {
  if (blocked.length === 0) return event;
  const reactions = event.reactions.filter((r) => !blocked.includes(r.memberId));
  const hiddenComments = comments.filter(
    (c) => c.eventId === event.id && blocked.includes(c.authorMemberId),
  ).length;
  if (reactions.length === event.reactions.length && hiddenComments === 0) return event;
  return { ...event, reactions, commentCount: Math.max(0, event.commentCount - hiddenComments) };
}

export function matchesVisibility(visibility: Visibility, viewer: Member): boolean {
  switch (visibility.kind) {
    case 'family':
      return true;

    // One rule for all three named-audience kinds: in a named group, OR named
    // individually. `custom` can carry both at once; `groups` and `members` are
    // the same thing with one of the two lists empty.
    case 'custom':
    case 'groups':
    case 'members':
      return (
        (visibility.groupIds ?? []).some((gid) => viewer.groupIds.includes(gid)) ||
        (visibility.memberIds ?? []).includes(viewer.id)
      );

    case 'private':
      // The author case is already handled in canSee(). Here it is always no.
      return false;

    default:
      // Unknown kind — deny. Fail closed, not fail open.
      return false;
  }
}

export function visibleEvents(
  events: FamilyEvent[],
  viewer: Member,
  blocked: readonly string[] = [],
): FamilyEvent[] {
  return events.filter((e) => canSee(e, viewer, blocked));
}

// ---------------------------------------------------------------------------
// 2. Role capabilities
// ---------------------------------------------------------------------------

export type Capability =
  | 'family.edit'
  | 'family.delete'
  | 'member.invite'
  | 'member.edit_role'
  | 'member.remove'
  | 'group.manage'
  | 'event.create'
  | 'event.edit_own'
  | 'event.edit_any'
  | 'event.delete_any'
  | 'comment.create'
  | 'reaction.create'
  | 'subscription.manage'
  | 'export.run';

const CAPABILITIES: Record<MemberRole, Capability[]> = {
  admin: [
    'family.edit',
    'family.delete',
    'member.invite',
    'member.edit_role',
    'member.remove',
    'group.manage',
    'event.create',
    'event.edit_own',
    'event.edit_any',
    'event.delete_any',
    'comment.create',
    'reaction.create',
    'subscription.manage',
    'export.run',
  ],
  member: ['event.create', 'event.edit_own', 'comment.create', 'reaction.create'],
  // A child profile is not used as an account — a parent manages it.
  // If a child is later given an account, the capabilities stay minimal.
  child: ['reaction.create'],
  // Grandparent / viewer: looks and reacts, does not write events.
  viewer: ['comment.create', 'reaction.create'],
};

export function can(member: Member, capability: Capability): boolean {
  if (member.status !== 'active') return false;
  return CAPABILITIES[member.role].includes(capability);
}

export function canEditEvent(event: FamilyEvent, member: Member): boolean {
  if (can(member, 'event.edit_any')) return true;
  return event.authorMemberId === member.id && can(member, 'event.edit_own');
}

export function canDeleteEvent(event: FamilyEvent, member: Member): boolean {
  if (can(member, 'event.delete_any')) return true;
  return event.authorMemberId === member.id && can(member, 'event.edit_own');
}

// ---------------------------------------------------------------------------
// 3. Protection of children's data
// ---------------------------------------------------------------------------

/**
 * May `actor` edit `target`'s profile?
 * A child profile may be edited only by an admin or the named guardian.
 */
export function canManageMember(actor: Member, target: Member): boolean {
  if (actor.familyId !== target.familyId) return false;
  if (target.role === 'child') {
    return can(actor, 'member.edit_role') || target.managedByMemberId === actor.id;
  }
  return can(actor, 'member.edit_role');
}

/**
 * Events a child takes part in must not reach viewers by default.
 * This returns the SAFE default visibility for a new event.
 *
 * Why: the feasibility study's regulatory risk "regulatory risk around
 * children's data" — the mitigation is to limit how far children's data
 * travels by default.
 */
export function defaultVisibilityFor(
  participants: Member[],
  parentsGroupId: string | undefined,
): Visibility {
  const hasChild = participants.some((m) => m.role === 'child');
  if (hasChild && parentsGroupId) {
    return { kind: 'groups', groupIds: [parentsGroupId] };
  }
  return { kind: 'family' };
}

// ---------------------------------------------------------------------------
// 4. Human-readable visibility description
// ---------------------------------------------------------------------------

/**
 * The short line under an event ("Seen by: Parents, Grandparents").
 * The user must always see who can see an event — without tapping anything.
 */
export function describeVisibility(
  visibility: Visibility,
  lookup: { groupName(id: string): string; memberName(id: string): string },
  labels: { family: string; private: string; andMore: (n: number) => string },
): string {
  switch (visibility.kind) {
    case 'family':
      return labels.family;
    case 'private':
      return labels.private;
    case 'groups': {
      const names = (visibility.groupIds ?? []).map(lookup.groupName);
      return joinNames(names, labels.andMore);
    }
    case 'members': {
      const names = (visibility.memberIds ?? []).map(lookup.memberName);
      return joinNames(names, labels.andMore);
    }
    default:
      return labels.private;
  }
}

function joinNames(names: string[], andMore: (n: number) => string): string {
  if (names.length === 0) return '—';
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} ${andMore(names.length - 2)}`;
}
