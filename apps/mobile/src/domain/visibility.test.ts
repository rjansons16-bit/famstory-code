import assert from 'node:assert/strict';

import type { FamilyEvent, Member, MemberRole, Visibility } from './types';
import {
  can,
  canDeleteEvent,
  canEditEvent,
  canManageMember,
  canSee,
  defaultVisibilityFor,
  describeVisibility,
  visibleEvents,
  withoutBlocked,
} from './visibility';

/**
 * Visibility logic tests.
 *
 * This is the one place in the code where a bug means a real data leak inside
 * a family: a grandparent seeing what a parent deliberately hid. So these tests
 * check not only "does it work" but "does it close rather than open when
 * something is wrong".
 *
 * Run with:  npm --prefix apps/mobile test
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAMILY = 'fam_1';
const G_PARENTS = 'grp_parents';
const G_GRANDPARENTS = 'grp_grandparents';

function member(overrides: Partial<Member> & { id: string; role: MemberRole }): Member {
  return {
    familyId: FAMILY,
    userId: `usr_${overrides.id}`,
    displayName: overrides.id,
    status: 'active',
    groupIds: [],
    joinedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function event(overrides: Partial<FamilyEvent> & { id: string }): FamilyEvent {
  return {
    familyId: FAMILY,
    title: 'Event',
    startsAt: '2026-09-01T08:00:00.000Z',
    allDay: false,
    categoryId: 'other',
    participantMemberIds: [],
    authorMemberId: 'anna',
    visibility: { kind: 'family' },
    attachments: [],
    reactions: [],
    commentCount: 0,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    isMilestone: false,
    ...overrides,
  };
}

const anna = member({ id: 'anna', role: 'admin', groupIds: [G_PARENTS] });
const martins = member({ id: 'martins', role: 'member', groupIds: [G_PARENTS] });
const emilija = member({ id: 'emilija', role: 'child', managedByMemberId: 'anna' });
const vija = member({ id: 'vija', role: 'viewer', groupIds: [G_GRANDPARENTS] });

// ---------------------------------------------------------------------------

describe('canSee — visibility kinds', () => {
  it('family: every active family member can see it', () => {
    const e = event({ id: 'e1', visibility: { kind: 'family' } });
    for (const m of [anna, martins, emilija, vija]) {
      assert.equal(canSee(e, m), true, `${m.displayName} cannot see it`);
    }
  });

  it('groups: only members of the named groups can see it', () => {
    const e = event({
      id: 'e2',
      authorMemberId: 'anna',
      visibility: { kind: 'groups', groupIds: [G_PARENTS] },
    });
    assert.equal(canSee(e, martins), true, 'a parent can see it');
    assert.equal(canSee(e, vija), false, 'a grandparent CANNOT');
    assert.equal(canSee(e, emilija), false, 'a child CANNOT');
  });

  it('groups: one matching group out of several is enough', () => {
    const e = event({
      id: 'e3',
      authorMemberId: 'martins',
      visibility: { kind: 'groups', groupIds: [G_PARENTS, G_GRANDPARENTS] },
    });
    assert.equal(canSee(e, vija), true);
    assert.equal(canSee(e, emilija), false);
  });

  it('members: only the listed people can see it', () => {
    const e = event({
      id: 'e4',
      authorMemberId: 'anna',
      visibility: { kind: 'members', memberIds: ['vija'] },
    });
    assert.equal(canSee(e, vija), true);
    assert.equal(canSee(e, martins), false);
  });

  it('private: nobody else sees it, not even an admin', () => {
    const e = event({ id: 'e5', authorMemberId: 'martins', visibility: { kind: 'private' } });
    assert.equal(canSee(e, martins), true, 'the author sees it');
    assert.equal(canSee(e, anna), false, 'an admin does NOT see someone else private event');
  });
});

describe('canSee — edge cases', () => {
  it('the author sees their own event under every visibility kind', () => {
    const kinds: Visibility[] = [
      { kind: 'family' },
      { kind: 'groups', groupIds: [G_GRANDPARENTS] },
      { kind: 'members', memberIds: ['vija'] },
      { kind: 'private' },
    ];
    for (const visibility of kinds) {
      const e = event({ id: 'e6', authorMemberId: 'martins', visibility });
      assert.equal(canSee(e, martins), true, `author cannot see it with kind ${visibility.kind}`);
    }
  });

  it('a removed member loses not just permissions but the view itself', () => {
    const removed = member({ id: 'martins', role: 'member', status: 'removed', groupIds: [G_PARENTS] });
    const e = event({ id: 'e7', visibility: { kind: 'family' } });
    assert.equal(canSee(e, removed), false);
  });

  it('a removed member cannot even see their own events', () => {
    const removed = member({ id: 'martins', role: 'member', status: 'removed' });
    const e = event({ id: 'e8', authorMemberId: 'martins', visibility: { kind: 'private' } });
    assert.equal(canSee(e, removed), false);
  });

  it('an event from another family is never visible', () => {
    const e = event({ id: 'e9', familyId: 'fam_2', authorMemberId: 'anna' });
    assert.equal(canSee(e, anna), false, 'not even to the author when the family does not match');
  });

  it('FAIL CLOSED: an unknown visibility kind means do not show', () => {
    const e = event({
      id: 'e10',
      authorMemberId: 'anna',
      // Simulates a future VisibilityKind that someone forgot to handle.
      visibility: { kind: 'shared_with_school' as unknown as Visibility['kind'] },
    });
    assert.equal(canSee(e, martins), false);
    assert.equal(canSee(e, vija), false);
  });

  it('groups with an empty list opens the event to nobody', () => {
    const e = event({ id: 'e11', authorMemberId: 'anna', visibility: { kind: 'groups', groupIds: [] } });
    assert.equal(canSee(e, martins), false);
  });

  it('groups with no groupIds field opens the event to nobody', () => {
    const e = event({ id: 'e12', authorMemberId: 'anna', visibility: { kind: 'groups' } });
    assert.equal(canSee(e, martins), false);
  });
});

describe('visibleEvents', () => {
  it('filters out what the viewer cannot see, keeping the order', () => {
    const events = [
      event({ id: 'a', visibility: { kind: 'family' } }),
      event({ id: 'b', authorMemberId: 'anna', visibility: { kind: 'groups', groupIds: [G_PARENTS] } }),
      event({ id: 'c', authorMemberId: 'anna', visibility: { kind: 'private' } }),
      event({ id: 'd', visibility: { kind: 'family' } }),
    ];
    assert.deepEqual(
      visibleEvents(events, vija).map((e) => e.id),
      ['a', 'd'],
    );
    assert.deepEqual(
      visibleEvents(events, anna).map((e) => e.id),
      ['a', 'b', 'c', 'd'],
    );
  });
});

// ---------------------------------------------------------------------------

describe('can — role capabilities', () => {
  it('an admin may manage the family', () => {
    assert.equal(can(anna, 'member.invite'), true);
    assert.equal(can(anna, 'group.manage'), true);
    assert.equal(can(anna, 'event.edit_any'), true);
  });

  it('a member may not manage people or other people events', () => {
    assert.equal(can(martins, 'event.create'), true);
    assert.equal(can(martins, 'member.invite'), false);
    assert.equal(can(martins, 'event.edit_any'), false);
  });

  it('a viewer comments but does not write events', () => {
    assert.equal(can(vija, 'comment.create'), true);
    assert.equal(can(vija, 'reaction.create'), true);
    assert.equal(can(vija, 'event.create'), false);
  });

  it('a child can only react', () => {
    assert.equal(can(emilija, 'reaction.create'), true);
    assert.equal(can(emilija, 'comment.create'), false);
    assert.equal(can(emilija, 'event.create'), false);
  });

  it('an inactive member has no capabilities at all', () => {
    const invited = member({ id: 'janis', role: 'admin', status: 'invited' });
    assert.equal(can(invited, 'reaction.create'), false);
    assert.equal(can(invited, 'family.edit'), false);
  });
});

describe('canEditEvent / canDeleteEvent', () => {
  const own = event({ id: 'own', authorMemberId: 'martins' });
  const others = event({ id: 'others', authorMemberId: 'anna' });

  it('a member edits only their own', () => {
    assert.equal(canEditEvent(own, martins), true);
    assert.equal(canEditEvent(others, martins), false);
  });

  it('an admin edits any of them', () => {
    assert.equal(canEditEvent(own, anna), true);
    assert.equal(canDeleteEvent(own, anna), true);
  });

  it('a viewer edits nothing', () => {
    assert.equal(canEditEvent(own, vija), false);
    assert.equal(canDeleteEvent(own, vija), false);
  });
});

// ---------------------------------------------------------------------------

describe('canManageMember — protection of children data', () => {
  it('the named guardian may edit the child profile', () => {
    assert.equal(canManageMember(anna, emilija), true);
  });

  it('another parent who is not the guardian may not', () => {
    assert.equal(canManageMember(martins, emilija), false);
  });

  it('a viewer may not edit anyone', () => {
    assert.equal(canManageMember(vija, emilija), false);
    assert.equal(canManageMember(vija, martins), false);
  });

  it('not even an admin may edit a member of another family', () => {
    const foreign = member({ id: 'x', role: 'member', familyId: 'fam_2' });
    assert.equal(canManageMember(anna, foreign), false);
  });
});

describe('defaultVisibilityFor — the safe default', () => {
  it('a child among the participants narrows visibility to Parents', () => {
    assert.deepEqual(defaultVisibilityFor([emilija, anna], G_PARENTS), {
      kind: 'groups',
      groupIds: [G_PARENTS],
    });
  });

  it('without a child it stays the whole family', () => {
    assert.deepEqual(defaultVisibilityFor([anna, martins], G_PARENTS), { kind: 'family' });
  });

  it('an empty participant list stays the whole family', () => {
    assert.deepEqual(defaultVisibilityFor([], G_PARENTS), { kind: 'family' });
  });

  it('with no Parents group it returns family rather than inventing one', () => {
    // Losing the safe default is bad, but pointing at a group that does not
    // exist is worse: the event would be invisible even to the other parent.
    assert.deepEqual(defaultVisibilityFor([emilija], undefined), { kind: 'family' });
  });
});

// ---------------------------------------------------------------------------

describe('describeVisibility', () => {
  const lookup = {
    groupName: (id: string) => ({ [G_PARENTS]: 'Parents', [G_GRANDPARENTS]: 'Grandparents' })[id] ?? '?',
    memberName: (id: string) => id,
  };
  const labels = {
    family: 'The whole family',
    private: 'Only me',
    andMore: (n: number) => `and ${n} more`,
  };

  it('names the groups', () => {
    assert.equal(
      describeVisibility({ kind: 'groups', groupIds: [G_PARENTS, G_GRANDPARENTS] }, lookup, labels),
      'Parents, Grandparents',
    );
  });

  it('truncates when there are more than two groups', () => {
    assert.equal(
      describeVisibility({ kind: 'groups', groupIds: [G_PARENTS, G_GRANDPARENTS, 'grp_x'] }, lookup, labels),
      'Parents, Grandparents and 1 more',
    );
  });

  it('an empty list does not produce misleading text', () => {
    assert.equal(describeVisibility({ kind: 'groups', groupIds: [] }, lookup, labels), '—');
  });

  it('family and private use the labels passed in', () => {
    assert.equal(describeVisibility({ kind: 'family' }, lookup, labels), 'The whole family');
    assert.equal(describeVisibility({ kind: 'private' }, lookup, labels), 'Only me');
  });
});

describe('Custom visibility — groups and people at once', () => {
  // The design merges "specific groups" and "specific people" into one choice,
  // because a user who wants *the grandparents plus my sister* should not have
  // to give up half of that. These check both halves are honoured.

  function customEvent(groupIds: string[], memberIds: string[]): FamilyEvent {
    return event({
      id: 'evt_custom',
      authorMemberId: 'martins',
      visibility: { kind: 'custom', groupIds, memberIds },
    });
  }

  it('a named group reaches its members', () => {
    assert.equal(canSee(customEvent([G_GRANDPARENTS], []), vija), true);
    assert.equal(canSee(customEvent([G_GRANDPARENTS], []), emilija), false);
  });

  it('a named person is reached without being in any chosen group', () => {
    assert.equal(canSee(customEvent([], ['emilija']), emilija), true);
  });

  it('groups and people are OR, not AND', () => {
    const e = customEvent([G_GRANDPARENTS], ['emilija']);
    assert.equal(canSee(e, vija), true, 'in the chosen group');
    assert.equal(canSee(e, emilija), true, 'named individually');
    assert.equal(canSee(e, anna), false, 'neither');
  });

  it('an empty custom audience shows nobody but the author', () => {
    // Fail closed. Ticking nothing must never mean "everyone".
    const e = customEvent([], []);
    assert.equal(canSee(e, vija), false);
    assert.equal(canSee(e, anna), false);
    assert.equal(canSee(e, martins), true, 'the author still sees their own event');
  });

  it('the older `groups` and `members` kinds still behave the same', () => {
    // Existing events carry them; they are custom with one of the lists empty.
    assert.equal(
      canSee(
        event({ id: 'e1', authorMemberId: 'anna', visibility: { kind: 'groups', groupIds: [G_GRANDPARENTS] } }),
        vija,
      ),
      true,
    );
    assert.equal(
      canSee(
        event({ id: 'e2', authorMemberId: 'anna', visibility: { kind: 'members', memberIds: ['emilija'] } }),
        emilija,
      ),
      true,
    );
  });
});

describe('A surprise', () => {
  it('is kept from the one it is for until its morning, whatever else says yes', () => {
    const wish = event({
      id: 'wish',
      authorMemberId: 'anna',
      visibility: { kind: 'family' },
      hiddenFromMemberId: 'vija',
      revealAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    assert.equal(canSee(wish, vija), false);
    assert.equal(canSee({ ...wish, revealAt: new Date(Date.now() - 1000).toISOString() }, vija), true);
    assert.equal(canSee(wish, martins), true);
  });
});

describe('A block', () => {
  it('what somebody the viewer blocked wrote is hidden, whatever its audience', () => {
    for (const visibility of [
      { kind: 'family' },
      { kind: 'members', memberIds: ['vija'] },
      { kind: 'custom', groupIds: [G_GRANDPARENTS], memberIds: ['vija'] },
    ] as Visibility[]) {
      const e = event({ id: 'e', authorMemberId: 'martins', visibility });
      assert.equal(canSee(e, vija), true);
      assert.equal(canSee(e, vija, ['martins']), false);
    }
  });

  it('is the blocker\'s alone: the blocked still see, and so does everybody else', () => {
    const fromAnna = event({ id: 'e', authorMemberId: 'anna' });
    // Vija blocked Martins; Martins's view of Anna's entry, and Anna's own, are untouched.
    assert.equal(canSee(fromAnna, martins, []), true);
    assert.equal(canSee(event({ id: 'm', authorMemberId: 'martins' }), anna, []), true);
  });

  it('takes the blocked member\'s reactions and comments out of what is left', () => {
    const e = event({
      id: 'e',
      reactions: [
        { memberId: 'martins', kind: 'heart' },
        { memberId: 'anna', kind: 'smile' },
      ],
      commentCount: 3,
    });
    const comments = [
      { id: 'c1', eventId: 'e', authorMemberId: 'martins', body: '…', createdAt: '' },
      { id: 'c2', eventId: 'e', authorMemberId: 'anna', body: '…', createdAt: '' },
      { id: 'c3', eventId: 'other', authorMemberId: 'martins', body: '…', createdAt: '' },
    ];

    const left = withoutBlocked(e, ['martins'], comments);
    assert.deepEqual(left.reactions, [{ memberId: 'anna', kind: 'smile' }]);
    assert.equal(left.commentCount, 2);
  });

  it('with nobody blocked, the very same event comes back', () => {
    const e = event({ id: 'e', reactions: [{ memberId: 'martins', kind: 'heart' }] });
    assert.equal(withoutBlocked(e, [], []), e);
  });
});
