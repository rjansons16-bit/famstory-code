import assert from 'node:assert/strict';

import { bellFor } from '@/domain/notifications';

import { useApp } from './store';

/**
 * Store tests for the destructive paths.
 *
 * Everything else in the store is a set() away from obvious. Deletion is not:
 * it is the one action a user cannot take back by repeating it, and the one
 * whose bugs are only noticed once the data is already gone.
 *
 * The store is a plain zustand store, so it can be driven directly — no
 * renderer, no hooks.
 */

const api = () => useApp.getState();

beforeEach(() => {
  // signIn() loads the mock family, which is the state every test starts from.
  api().signIn('email');
});

afterEach(() => {
  api().signOut();
});

describe('Deleting an event', () => {
  it('removes it from the timeline', () => {
    const target = api().events[0];
    const before = api().events.length;

    api().deleteEvent(target.id);

    assert.equal(api().events.length, before - 1);
    assert.equal(
      api().events.find((e) => e.id === target.id),
      undefined,
    );
  });

  it('keeps it so it can be put back', () => {
    const target = api().events[0];
    api().deleteEvent(target.id);

    assert.equal(api().recentlyDeleted?.event.id, target.id);
  });

  it('takes the comments with it', () => {
    // An event whose comments exist in the mock.
    const target = api().events.find((e) => api().comments.some((c) => c.eventId === e.id));
    assert.ok(target, 'the mock must contain an event with comments');

    const commentsBefore = api().comments.filter((c) => c.eventId === target.id).length;
    assert.ok(commentsBefore > 0);

    api().deleteEvent(target.id);

    assert.equal(api().comments.filter((c) => c.eventId === target.id).length, 0);
    assert.equal(api().recentlyDeleted?.comments.length, commentsBefore);
  });

  it('deleting an id that does not exist changes nothing', () => {
    const before = api().events.length;
    api().deleteEvent('evt_does_not_exist');

    assert.equal(api().events.length, before);
    assert.equal(api().recentlyDeleted, null);
  });
});

describe('Wish lists on the sample family', () => {
  it('loads a list, and adding puts the line on it as written by whoever is signed in', async () => {
    await api().loadWishes('mem_vera');
    const before = api().wishes.mem_vera?.length ?? 0;

    api().addWish('mem_vera', '  A good   book ');

    const list = api().wishes.mem_vera ?? [];
    assert.equal(list.length, before + 1);
    assert.equal(list[list.length - 1].text, 'A good book');
    assert.equal(list[list.length - 1].addedByMemberId, api().session?.activeMemberId);
  });

  it('a claim goes on and comes off', async () => {
    await api().loadWishes('mem_vera');
    const free = api().wishes.mem_vera?.find((w) => w.claimedByMemberId === null);
    assert.ok(free, 'the sample list must have a line nobody has claimed');

    api().toggleWishClaim('mem_vera', free.id);
    assert.equal(
      api().wishes.mem_vera?.find((w) => w.id === free.id)?.claimedByMemberId,
      api().session?.activeMemberId,
    );

    api().toggleWishClaim('mem_vera', free.id);
    assert.equal(api().wishes.mem_vera?.find((w) => w.id === free.id)?.claimedByMemberId, null);
  });

  it('signing out forgets every list - they are other people’s surprises', async () => {
    await api().loadWishes('mem_vera');
    api().signOut();
    assert.deepEqual(api().wishes, {});
  });
});

describe('Events found elsewhere', () => {
  it('a search result from the server joins the list once, and only once', () => {
    const before = api().events.length;
    const found = { ...api().events[0], id: 'evt_from_1998', title: 'Grandma’s garden' };

    api().mergeEvents([found]);
    api().mergeEvents([found]);

    assert.equal(api().events.length, before + 1);
  });

  it('never replaces an event the timeline already has', () => {
    const existing = api().events[0];
    api().mergeEvents([{ ...existing, title: 'A stale copy' }]);
    assert.equal(api().events.find((e) => e.id === existing.id)?.title, existing.title);
  });
});

describe('A repeating series', () => {
  it('skipping one occurrence takes out exactly that day', () => {
    const series = api().events.find((e) => e.repeat);
    assert.ok(series, 'the sample family must have a repeating event');
    const before = series.repeatSkips ?? [];

    api().skipOccurrence(series.id, '2031-01-01');

    const after = api().events.find((e) => e.id === series.id);
    assert.deepEqual(after?.repeatSkips, [...before, '2031-01-01'].sort());
    assert.equal(after?.repeat, series.repeat);
  });

  it('skipping the same day twice changes nothing', () => {
    const series = api().events.find((e) => e.repeat)!;
    api().skipOccurrence(series.id, '2031-01-01');
    const once = api().events.find((e) => e.id === series.id)?.repeatSkips;
    api().skipOccurrence(series.id, '2031-01-01');
    assert.deepEqual(api().events.find((e) => e.id === series.id)?.repeatSkips, once);
  });

  it('stopping from a day ends the series the day before', () => {
    const series = api().events.find((e) => e.repeat)!;
    api().stopRepeatingFrom(series.id, '2031-03-01');

    const until = api().events.find((e) => e.id === series.id)?.repeatUntil;
    assert.ok(until);
    const day = new Date(until);
    assert.deepEqual([day.getFullYear(), day.getMonth(), day.getDate()], [2031, 1, 28]);
  });

  it('a one-off event cannot be skipped into a series', () => {
    const once = api().events.find((e) => !e.repeat)!;
    api().skipOccurrence(once.id, '2031-01-01');
    assert.equal(api().events.find((e) => e.id === once.id)?.repeatSkips, once.repeatSkips);
  });
});

describe('In memoriam', () => {
  it('marks the day on the member and keeps the member', () => {
    api().setMemorial('mem_vera', '2026-03-02T12:00:00.000Z');
    const vera = api().members.find((m) => m.id === 'mem_vera');
    assert.equal(vera?.diedOn, '2026-03-02T12:00:00.000Z');
    assert.equal(vera?.status, 'active');
  });

  it('can be taken back', () => {
    api().setMemorial('mem_vera', '2026-03-02T12:00:00.000Z');
    api().setMemorial('mem_vera', null);
    assert.equal(api().members.find((m) => m.id === 'mem_vera')?.diedOn, undefined);
  });
});

describe('Deleting a group', () => {
  function eventFor(visibility: ReturnType<typeof api>['events'][number]['visibility']) {
    return api().addEvent({
      title: 'Audience test',
      startsAt: '2026-09-01T08:00:00.000Z',
      allDay: false,
      categoryId: 'other',
      participantMemberIds: [],
      visibility,
      attachments: [],
      tags: [],
      isMilestone: false,
    });
  }

  it('a custom audience keeps its people when its group goes', () => {
    const group = api().createGroup('Cousins', []);
    const event = eventFor({ kind: 'custom', groupIds: [group.id], memberIds: ['mem_vija'] });

    api().deleteGroup(group.id);

    const after = api().events.find((e) => e.id === event.id);
    assert.deepEqual(after?.visibility, { kind: 'custom', groupIds: [], memberIds: ['mem_vija'] });
  });

  it('a custom audience of that group alone becomes private', () => {
    const group = api().createGroup('Cousins', []);
    const event = eventFor({ kind: 'custom', groupIds: [group.id], memberIds: [] });

    api().deleteGroup(group.id);

    const after = api().events.find((e) => e.id === event.id);
    assert.deepEqual(after?.visibility, { kind: 'private' });
  });

  it('an event that never named the group is left alone', () => {
    const group = api().createGroup('Cousins', []);
    const event = eventFor({ kind: 'custom', groupIds: [], memberIds: ['mem_vija'] });

    api().deleteGroup(group.id);

    const after = api().events.find((e) => e.id === event.id);
    assert.deepEqual(after?.visibility, { kind: 'custom', groupIds: [], memberIds: ['mem_vija'] });
  });
});

describe('Undo', () => {
  it('puts the event back', () => {
    const target = api().events[0];
    const before = api().events.length;

    api().deleteEvent(target.id);
    api().undoDelete();

    assert.equal(api().events.length, before);
    assert.ok(api().events.find((e) => e.id === target.id));
  });

  it('puts the comments back too', () => {
    const target = api().events.find((e) => api().comments.some((c) => c.eventId === e.id));
    assert.ok(target);
    const before = api().comments.filter((c) => c.eventId === target.id).length;

    api().deleteEvent(target.id);
    api().undoDelete();

    assert.equal(api().comments.filter((c) => c.eventId === target.id).length, before);
  });

  it('restores the event unchanged, not a copy with a new id', () => {
    // A new id would break every comment, reaction and notification pointing
    // at it — the event would come back looking right and be quietly orphaned.
    const target = api().events[0];
    api().deleteEvent(target.id);
    api().undoDelete();

    assert.deepEqual(
      api().events.find((e) => e.id === target.id),
      target,
    );
  });

  it('clears the offer once it is used', () => {
    api().deleteEvent(api().events[0].id);
    api().undoDelete();

    assert.equal(api().recentlyDeleted, null);
  });

  it('undo twice does not duplicate the event', () => {
    const target = api().events[0];
    const before = api().events.length;

    api().deleteEvent(target.id);
    api().undoDelete();
    api().undoDelete();

    assert.equal(api().events.length, before);
  });

  it('dismissing makes the deletion final', () => {
    const target = api().events[0];
    api().deleteEvent(target.id);
    api().dismissUndo();
    api().undoDelete();

    assert.equal(api().recentlyDeleted, null);
    assert.equal(
      api().events.find((e) => e.id === target.id),
      undefined,
    );
  });

  it('a second delete replaces the first offer', () => {
    // Only the most recent is recoverable. Queueing them would mean an undo
    // bar that restores something the user has already forgotten deleting.
    const [first, second] = api().events;

    api().deleteEvent(first.id);
    api().deleteEvent(second.id);

    assert.equal(api().recentlyDeleted?.event.id, second.id);
    api().undoDelete();

    assert.ok(api().events.find((e) => e.id === second.id));
    assert.equal(
      api().events.find((e) => e.id === first.id),
      undefined,
    );
  });
});

describe('Signing out', () => {
  it('leaves nothing behind', () => {
    api().deleteEvent(api().events[0].id);
    api().signOut();

    const state = api();
    assert.equal(state.session, null);
    assert.equal(state.family, null);
    assert.deepEqual(state.events, []);
    assert.deepEqual(state.comments, []);
    // A deleted event held for undo must not survive a sign-out — the next
    // person to sign in on this device would be handed someone else's memory.
    assert.equal(state.recentlyDeleted, null);
  });

  it('takes whom they blocked with them', () => {
    const other = api().members.find((m) => m.id !== api().session?.activeMemberId && m.role !== 'child')!;
    api().blockMember(other.id);
    api().signOut();
    assert.deepEqual(api().blockedMemberIds, []);
  });
});

describe('Blocking somebody on the sample family', () => {
  const me = () => api().session!.activeMemberId;
  const author = () => {
    const e = api().events.find((x) => x.authorMemberId !== me());
    assert.ok(e, 'the sample family has entries by somebody else');
    return e.authorMemberId;
  };

  it('blocks once, never yourself, and unblocks', () => {
    const them = author();
    api().blockMember(them);
    api().blockMember(them);
    api().blockMember(me());
    assert.deepEqual(api().blockedMemberIds, [them]);

    api().unblockMember(them);
    assert.deepEqual(api().blockedMemberIds, []);
  });

  it('takes what they did off the bell, keeps what nobody did, and an unblock brings it back', () => {
    const vera = api().notifications.find((n) => n.actorMemberId);
    assert.ok(vera, 'the sample bell has something somebody did');
    const all = api().notifications.length;
    const bell = () => bellFor(api().notifications, api().blockedMemberIds);

    api().blockMember(vera.actorMemberId!);
    assert.equal(bell().length, all - 1);
    assert.ok(bell().some((n) => !n.actorMemberId));

    api().unblockMember(vera.actorMemberId!);
    assert.equal(bell().length, all);
  });
});

describe('Onboarding', () => {
  beforeEach(() => {
    // A brand-new account: signed in, no family. This is the state the
    // onboarding screens run in, and it is not the one the tests above use.
    api().signIn('email', { newUser: true });
  });

  it('the name given before the family reaches the family', () => {
    api().updateMyProfile({ displayName: '  Maria  ' });
    assert.equal(api().session?.user.displayName, 'Maria');

    api().createFamily('The Kalnins');

    const me = api().members.find((m) => m.id === api().session?.activeMemberId);
    assert.equal(me?.displayName, 'Maria');
  });

  it('the birthday and photo given before the family reach the family', async () => {
    // "About you" runs with no member row to write to. For a while these went
    // onto the member list — empty for a new account — and were simply lost.
    const birthday = new Date(1970, 2, 14, 12).toISOString();
    api().updateMyProfile({ displayName: 'Maria', birthDate: birthday, avatarUrl: 'file:///me.jpg' });

    assert.equal(await api().createFamily('The Kalnins'), true);

    const me = api().members.find((m) => m.id === api().session?.activeMemberId);
    assert.equal(me?.birthDate, birthday);
    assert.equal(me?.avatarUrl, 'file:///me.jpg');
    assert.deepEqual(api().pendingProfile, {}, 'nothing should be left waiting');
  });

  it('the birthday reaches a family joined with a code, too', async () => {
    const birthday = new Date(1950, 10, 20, 12).toISOString();
    api().updateMyProfile({ birthDate: birthday });

    assert.equal(await api().joinFamily('FAM-J4K7'), true);

    const me = api().members.find((m) => m.id === api().session?.activeMemberId);
    assert.equal(me?.birthDate, birthday);
  });

  it('a new account on the demo is nobody yet, not the sample family’s Anna', () => {
    // It was Anna under a new name, and the profile read the name typed on
    // "About you" over anna.berg@example.com.
    assert.equal(api().session?.user.email, '');
    assert.notEqual(api().session?.user.id, 'usr_anna');
    assert.equal(api().session?.user.displayName, '');
  });

  it('joining the sample family makes you a new member of it, not Anna', async () => {
    api().updateMyProfile({ displayName: 'Rj' });

    assert.equal(await api().joinFamily('FAM-J4K7'), true);

    const me = api().members.find((m) => m.id === api().session?.activeMemberId);
    assert.equal(me?.displayName, 'Rj');
    assert.equal(me?.role, 'member');
    assert.notEqual(me?.id, 'mem_anna');
    assert.equal(api().session?.user.displayName, 'Rj');
    // Anna is still there, as herself.
    assert.equal(api().members.find((m) => m.id === 'mem_anna')?.displayName, 'Anna');
  });

  it('what you like, chosen before the family exists, reaches the family - created or joined', async () => {
    api().setMyInterests(['garden', 'music']);
    assert.deepEqual(api().pendingProfile.interests, ['garden', 'music']);

    assert.equal(await api().createFamily('The Kalnins'), true);
    const me = api().members.find((m) => m.id === api().session?.activeMemberId);
    assert.deepEqual(me?.interests, ['garden', 'music']);
    assert.deepEqual(api().pendingProfile, {});

    api().signOut();
    api().signIn('email', { newUser: true });
    api().setMyInterests(['fishing', 'astrology' as never]);
    assert.equal(await api().joinFamily('FAM-J4K7'), true);
    const joined = api().members.find((m) => m.id === api().session?.activeMemberId);
    assert.deepEqual(joined?.interests, ['fishing'], 'only keys the app knows');
  });

  it('a birthday typed during onboarding does not outlive signing out', () => {
    api().updateMyProfile({ birthDate: new Date(1970, 2, 14, 12).toISOString() });
    api().signOut();
    assert.deepEqual(api().pendingProfile, {});
  });

  it('renaming after the family exists moves the member row too', () => {
    api().createFamily('The Kalnins');
    api().updateMyProfile({ displayName: 'Maria' });

    // The member row is what avatars and "added by" lines read. A name that
    // moved only on the account would leave the family looking at the old one.
    const me = api().members.find((m) => m.id === api().session?.activeMemberId);
    assert.equal(me?.displayName, 'Maria');
  });

  it('an empty name changes nothing', () => {
    api().createFamily('The Kalnins');
    const before = api().session?.user.displayName;

    api().updateMyProfile({ displayName: '   ' });

    assert.equal(api().session?.user.displayName, before);
  });

  it('a child gets a guardian and no account of their own', async () => {
    await api().createFamily('The Kalnins');
    const guardian = api().session?.activeMemberId;

    const child = await api().addChild('Emily');

    assert.ok(child, 'a child must be created once the family exists');
    assert.equal(child.role, 'child');
    // Regulatory, not a shortcut: no account, and a named adult behind it.
    assert.equal(child.userId, null);
    assert.equal(child.managedByMemberId, guardian);
  });

  it('a child lands in the Children group, on both sides', async () => {
    await api().createFamily('The Kalnins');

    const child = await api().addChild('Emily');
    const children = api().groups.find((g) => g.isSystem && g.icon === 'children');

    assert.ok(child);
    assert.ok(children, 'creating a family must create the system groups');
    // Membership is stored twice and both copies feed visibility. One of them
    // going stale is how an event silently reaches the wrong people.
    assert.ok(children.memberIds.includes(child.id));
    assert.ok(child.groupIds.includes(children.id));
  });

  it('a child cannot be added before the family exists', async () => {
    // Fail closed: outside a family a child profile has no visibility rules to
    // sit under and nobody responsible for it.
    assert.equal(await api().addChild('Emily'), null);
    assert.deepEqual(api().members, []);
  });

  it('the first event is written into the new family, not the mock one', () => {
    api().createFamily('The Kalnins');
    const familyId = api().family?.id;

    const event = api().addEvent({
      title: 'The day we moved in',
      startsAt: new Date().toISOString(),
      allDay: true,
      categoryId: 'milestone',
      participantMemberIds: [],
      visibility: { kind: 'family' },
      attachments: [],
      tags: [],
      isMilestone: false,
    });

    assert.equal(event.familyId, familyId);
    assert.equal(event.authorMemberId, api().session?.activeMemberId);
    assert.equal(api().events.length, 1);
  });
});

describe('Taking the account away with you', () => {
  it('writes a file that holds the family', async () => {
    const file = await api().exportMyData();

    assert.ok(file);
    const parsed = JSON.parse(file) as { format: string; events: unknown[] };
    assert.equal(parsed.format, 'famstory.export.v1');
    assert.ok(parsed.events.length > 0);
  });

  it('signs out when the account is deleted', async () => {
    assert.ok(api().session);

    const done = await api().deleteMyAccount();

    assert.equal(done, true);
    assert.equal(api().session, null);
  });
});

describe('Editing your own profile after onboarding', () => {
  it('changes the name the family sees on your member row', () => {
    const meId = api().session?.activeMemberId;

    api().updateMyProfile({ displayName: 'Anna Berga' });

    assert.equal(api().members.find((m) => m.id === meId)?.displayName, 'Anna Berga');
    assert.equal(api().session?.user.displayName, 'Anna Berga');
  });

  it('changes the birthday the family is reminded of', () => {
    const meId = api().session?.activeMemberId;
    const birthday = new Date(1988, 4, 20, 12).toISOString();

    api().updateMyProfile({ birthDate: birthday });

    assert.equal(api().members.find((m) => m.id === meId)?.birthDate, birthday);
  });

  it('changes what you like, on your own row', () => {
    const meId = api().session?.activeMemberId;
    api().setMyInterests(['coffee']);
    assert.deepEqual(api().members.find((m) => m.id === meId)?.interests, ['coffee']);
  });

  it("changes a child's interests only for the adults who look after the profile", () => {
    // Anna manages Emily; Martin does not, and is not an admin.
    api().setChildInterests('mem_emily', ['games']);
    assert.deepEqual(api().members.find((m) => m.id === 'mem_emily')?.interests, ['games']);

    useApp.setState({ session: { ...api().session!, activeMemberId: 'mem_martin' } });
    api().setChildInterests('mem_emily', ['tech']);
    assert.deepEqual(api().members.find((m) => m.id === 'mem_emily')?.interests, ['games']);

    // Nor anybody else's, adult or not.
    api().setChildInterests('mem_vera', ['tech']);
    assert.notDeepEqual(api().members.find((m) => m.id === 'mem_vera')?.interests, ['tech']);
  });

  it('ignores a name that is only spaces', () => {
    const meId = api().session?.activeMemberId;
    const before = api().members.find((m) => m.id === meId)?.displayName;

    api().updateMyProfile({ displayName: '   ' });

    assert.equal(api().members.find((m) => m.id === meId)?.displayName, before);
  });
});

describe('Pushes on the sample family', () => {
  it('never ask the phone: there is no server to tell', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const notifications = require('expo-notifications') as { requestPermissionsAsync: jest.Mock };
    notifications.requestPermissionsAsync.mockClear();

    const answer = await api().registerPush(true);

    assert.equal(answer, 'undetermined');
    assert.equal(notifications.requestPermissionsAsync.mock.calls.length, 0);
  });
});

describe("Renaming the family", () => {
  it('an administrator renames it, trimmed', () => {
    api().renameFamily('  Bergi  ');
    assert.equal(api().family?.name, 'Bergi');
  });

  it('a name that is only spaces changes nothing', () => {
    const before = api().family?.name;
    api().renameFamily('   ');
    assert.equal(api().family?.name, before);
  });

  it('somebody who is not an administrator cannot', () => {
    const before = api().family?.name;
    // Martin is a member, not an administrator.
    useApp.setState({ session: { ...api().session!, activeMemberId: 'mem_martin' } });
    api().renameFamily('Mārtiņa ģimene');
    assert.equal(api().family?.name, before);
  });
});

describe('An invitation that arrives by link', () => {
  afterEach(() => {
    useApp.setState({ pendingInviteCode: null });
  });

  it('is remembered across the sign-up detour, in the form the server expects', () => {
    api().rememberInvite('  fam-1234 ');

    // Upper case and trimmed: the code in a link is whatever a messenger or a
    // phone keyboard made of it, and the server matches it exactly.
    assert.equal(api().pendingInviteCode, 'FAM-1234');
  });

  it('is forgotten once the person has signed out', () => {
    api().rememberInvite('FAM-1234');
    api().signOut();

    // A code left behind after sign-out would send the NEXT person on this
    // device to somebody else's family, so it has to go. (It used to stay:
    // this test is how that was found.)
    assert.equal(api().pendingInviteCode, null);
  });
});

describe('Taking a gift idea', () => {
  it('writes it onto their wish list as yours, in one step', async () => {
    await api().loadWishes('mem_vera');
    api().addWish('mem_vera', 'A reading lamp', { claim: true });

    const line = api().wishes.mem_vera.find((w) => w.text === 'A reading lamp');
    assert.equal(line?.claimedByMemberId, 'mem_anna');
    assert.equal(line?.addedByMemberId, 'mem_anna');
  });

  it('never claims on your own list', async () => {
    await api().loadWishes('mem_anna');
    api().addWish('mem_anna', 'A reading lamp', { claim: true });

    const line = api().wishes.mem_anna.find((w) => w.text === 'A reading lamp');
    assert.equal(line?.claimedByMemberId, null);
  });
});
