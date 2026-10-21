import assert from 'node:assert/strict';

import { FamStoryApi } from './api';
import { HttpClient, type TokenStore } from './http';

/**
 * API client translation tests.
 *
 * The server returns a relational shape (separate `visibility` rows); screens
 * work with a flattened `FamilyEvent`. A bug in that translation means the
 * visibility badge on a card shows something other than the truth — the user
 * believes only the parents can see an event when in fact the whole family can.
 *
 * The server still filters correctly, so no data leaks. But the user makes
 * decisions from what they see, which makes this bug just as bad.
 */

const BASE = 'https://api.test/v1';

function tokens(): TokenStore {
  return {
    accessToken: 'acc',
    refreshToken: 'ref',
    save() {},
    clear() {},
  };
}

/** A fake fetch that returns the given body for any request. */
function apiReturning(body: unknown, capture?: { calls: { url: string; init: RequestInit }[] }) {
  const http = new HttpClient({
    baseUrl: BASE,
    tokens: tokens(),
    fetchImpl: ((url: string, init: RequestInit) => {
      capture?.calls.push({ url, init });
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }) as unknown as typeof fetch,
  });
  return new FamStoryApi(http, BASE);
}

function serverEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    familyId: 'fam_1',
    title: 'Event',
    description: null,
    startsAt: '2026-09-01T08:30:00.000Z',
    endsAt: null,
    allDay: false,
    categoryId: 'education',
    isMilestone: false,
    authorMemberId: 'mem_anna',
    visibilityKind: 'family',
    visibility: [],
    participants: [],
    attachments: [],
    reactions: [],
    reminders: [],
    _count: { comments: 0 },
    createdAt: '2026-09-01T08:30:00.000Z',
    updatedAt: '2026-09-01T08:30:00.000Z',
    ...overrides,
  };
}

describe('Visibility translation', () => {
  it('family stays family', async () => {
    const api = apiReturning({ items: [serverEvent()], nextCursor: null });
    const { items } = await api.listEvents('fam_1');
    assert.deepEqual(items[0].visibility, { kind: 'family' });
  });

  it('groups collects group ids and ignores member rows', async () => {
    const api = apiReturning({
      items: [
        serverEvent({
          visibilityKind: 'groups',
          visibility: [
            { groupId: 'grp_parents', memberId: null },
            { groupId: 'grp_grandparents', memberId: null },
          ],
        }),
      ],
      nextCursor: null,
    });

    const { items } = await api.listEvents('fam_1');
    assert.deepEqual(items[0].visibility, {
      kind: 'groups',
      groupIds: ['grp_parents', 'grp_grandparents'],
    });
  });

  it('members collects member ids', async () => {
    const api = apiReturning({
      items: [
        serverEvent({
          visibilityKind: 'members',
          visibility: [{ groupId: null, memberId: 'mem_vija' }],
        }),
      ],
      nextCursor: null,
    });

    const { items } = await api.listEvents('fam_1');
    assert.deepEqual(items[0].visibility, { kind: 'members', memberIds: ['mem_vija'] });
  });

  it('custom carries the groups AND the people', async () => {
    // It used to fall through to "family": the badge said everybody, the
    // server said only the people picked.
    const api = apiReturning({
      items: [
        serverEvent({
          visibilityKind: 'custom',
          visibility: [
            { groupId: 'grp_grandparents', memberId: null },
            { groupId: null, memberId: 'mem_vija' },
          ],
        }),
      ],
      nextCursor: null,
    });

    const { items } = await api.listEvents('fam_1');
    assert.deepEqual(items[0].visibility, {
      kind: 'custom',
      groupIds: ['grp_grandparents'],
      memberIds: ['mem_vija'],
    });
  });

  it('private stays private even if the server sends an empty list', async () => {
    const api = apiReturning({
      items: [serverEvent({ visibilityKind: 'private', visibility: [] })],
      nextCursor: null,
    });

    const { items } = await api.listEvents('fam_1');
    assert.deepEqual(items[0].visibility, { kind: 'private' });
  });

  it('an unknown kind falls back to family, which is safe only because the server already filtered', async () => {
    // If the server ever introduces a kind the client does not know, the client
    // renders it as "the whole family". That is safe on the CLIENT only because
    // the server has already filtered the list. This test records that as a
    // deliberate choice rather than an accident.
    const api = apiReturning({
      items: [serverEvent({ visibilityKind: 'shared_with_school', visibility: [] })],
      nextCursor: null,
    });

    const { items } = await api.listEvents('fam_1');
    assert.equal(items[0].visibility.kind, 'family');
  });

  it('a missing visibility field does not break the translation', async () => {
    const event = serverEvent({ visibilityKind: 'groups' });
    delete (event as Record<string, unknown>).visibility;

    const api = apiReturning({ items: [event], nextCursor: null });
    const { items } = await api.listEvents('fam_1');
    assert.deepEqual(items[0].visibility, { kind: 'groups', groupIds: [] });
  });
});

describe('Event field translation', () => {
  it('tags come back from the server instead of vanishing on the next refresh', async () => {
    const api = apiReturning({
      items: [serverEvent({ tags: ['School', 'First day'] })],
      nextCursor: null,
    });
    const { items } = await api.listEvents('fam_1');
    assert.deepEqual(items[0].tags, ['School', 'First day']);
  });

  it('an older server without tags gives an empty list, not undefined', async () => {
    const api = apiReturning({ items: [serverEvent()], nextCursor: null });
    const { items } = await api.listEvents('fam_1');
    assert.deepEqual(items[0].tags, []);
  });

  it('a category this version does not know is "other", not a card that cannot be drawn', async () => {
    const api = apiReturning({
      items: [serverEvent({ categoryId: 'gardening' }), serverEvent({ categoryId: 'health' })],
      nextCursor: null,
    });
    const { items } = await api.listEvents('fam_1');
    assert.equal(items[0].categoryId, 'other');
    assert.equal(items[1].categoryId, 'health');
  });

  it('null becomes undefined, not an empty string', async () => {
    const api = apiReturning({ items: [serverEvent()], nextCursor: null });
    const { items } = await api.listEvents('fam_1');

    assert.equal(items[0].description, undefined);
    assert.equal(items[0].endsAt, undefined);
    assert.equal(items[0].reminder, undefined);
  });

  it('participants are flattened into a list of ids', async () => {
    const api = apiReturning({
      items: [
        serverEvent({
          participants: [{ memberId: 'mem_emilija' }, { memberId: 'mem_anna' }],
        }),
      ],
      nextCursor: null,
    });

    const { items } = await api.listEvents('fam_1');
    assert.deepEqual(items[0].participantMemberIds, ['mem_emilija', 'mem_anna']);
  });

  it('the comment count comes from _count, and its absence gives 0', async () => {
    const withCount = apiReturning({
      items: [serverEvent({ _count: { comments: 7 } })],
      nextCursor: null,
    });
    assert.equal((await withCount.listEvents('fam_1')).items[0].commentCount, 7);

    const event = serverEvent();
    delete (event as Record<string, unknown>)._count;
    const without = apiReturning({ items: [event], nextCursor: null });
    assert.equal((await without.listEvents('fam_1')).items[0].commentCount, 0);
  });

  it('the first enabled reminder reaches the event', async () => {
    const api = apiReturning({
      items: [
        serverEvent({
          reminders: [{ id: 'rem_1', minutesBefore: 1440, enabled: true }],
        }),
      ],
      nextCursor: null,
    });

    const { items } = await api.listEvents('fam_1');
    assert.equal(items[0].reminder?.minutesBefore, 1440);
    assert.equal(items[0].reminder?.eventId, 'evt_1');
  });

  it('the attachment URL points at the server, not at the storageKey', async () => {
    const api = apiReturning({
      items: [
        serverEvent({
          attachments: [
            {
              id: 'att_1',
              kind: 'image',
              storageKey: 'families/fam_1/att_1.jpg',
              thumbnailKey: 'families/fam_1/att_1_thumb.jpg',
              width: 1200,
              height: 800,
              durationSec: null,
            },
          ],
        }),
      ],
      nextCursor: null,
    });

    const { items } = await api.listEvents('fam_1');
    const attachment = items[0].attachments[0];

    // The storageKey must never reach the client as a link: access goes
    // through the server, which checks visibility first.
    assert.ok(!attachment.url.includes('families/fam_1'));
    assert.equal(attachment.url, `${BASE}/attachments/att_1/url`);
    assert.ok(attachment.thumbnailUrl?.includes('variant=thumb'));
  });

  it('with no thumbnail, thumbnailUrl stays undefined', async () => {
    const api = apiReturning({
      items: [
        serverEvent({
          attachments: [
            {
              id: 'att_2',
              kind: 'image',
              storageKey: 'k',
              thumbnailKey: null,
              width: null,
              height: null,
              durationSec: null,
            },
          ],
        }),
      ],
      nextCursor: null,
    });

    const { items } = await api.listEvents('fam_1');
    assert.equal(items[0].attachments[0].thumbnailUrl, undefined);
  });
});

describe('Family snapshot', () => {
  it('member groups are flattened from groupLinks', async () => {
    const api = apiReturning({
      id: 'fam_1',
      name: 'The Bergs',
      coverUrl: null,
      locale: 'lv',
      createdAt: '2025-01-01T00:00:00.000Z',
      members: [
        {
          id: 'mem_anna',
          familyId: 'fam_1',
          userId: 'usr_anna',
          displayName: 'Anna',
          avatarUrl: null,
          role: 'admin',
          status: 'active',
          managedByMemberId: null,
          birthDate: null,
          joinedAt: '2025-01-01T00:00:00.000Z',
          groupLinks: [{ groupId: 'grp_parents' }],
        },
      ],
      groups: [
        {
          id: 'grp_parents',
          familyId: 'fam_1',
          name: 'Parents',
          icon: 'parents',
          isSystem: true,
          members: [{ memberId: 'mem_anna' }],
        },
      ],
      subscription: null,
    });

    const snapshot = await api.getFamily('fam_1');

    assert.deepEqual(snapshot.members[0].groupIds, ['grp_parents']);
    assert.deepEqual(snapshot.groups[0].memberIds, ['mem_anna']);
    assert.equal(snapshot.members[0].managedByMemberId, undefined);
  });

  it('with no subscription the plan is free, not undefined', async () => {
    const api = apiReturning({
      id: 'fam_1',
      name: 'X',
      coverUrl: null,
      locale: 'lv',
      createdAt: '2025-01-01T00:00:00.000Z',
      subscription: null,
    });

    assert.equal((await api.getFamily('fam_1')).family.plan, 'free');
  });

  it('a premium subscription reaches the plan', async () => {
    const api = apiReturning({
      id: 'fam_1',
      name: 'X',
      coverUrl: null,
      locale: 'lv',
      createdAt: '2025-01-01T00:00:00.000Z',
      subscription: { plan: 'premium', status: 'active' },
    });

    assert.equal((await api.getFamily('fam_1')).family.plan, 'premium');
  });

  it('an unknown locale falls back rather than passing through an invalid value', async () => {
    const api = apiReturning({
      id: 'fam_1',
      name: 'X',
      coverUrl: null,
      locale: 'de',
      createdAt: '2025-01-01T00:00:00.000Z',
      subscription: null,
    });

    assert.equal((await api.getFamily('fam_1')).family.locale, 'lv');
  });
});

describe('Paths and methods', () => {
  it('the event list goes to the family path with its filters', async () => {
    const capture = { calls: [] as { url: string; init: RequestInit }[] };
    const api = apiReturning({ items: [], nextCursor: null }, capture);

    await api.listEvents('fam_1', { categoryId: 'health', milestonesOnly: true, limit: 20 });

    const { url, init } = capture.calls[0];
    assert.ok(url.startsWith(`${BASE}/families/fam_1/events`));
    assert.ok(url.includes('categoryId=health'));
    assert.ok(url.includes('milestonesOnly=true'));
    assert.equal(init.method, 'GET');
  });

  it('registration and sign-in do not send a token', async () => {
    const capture = { calls: [] as { url: string; init: RequestInit }[] };
    const api = apiReturning({ accessToken: 'a', refreshToken: 'r', expiresIn: 900, user: {} }, capture);

    await api.login({ email: 'a@b.lv', password: 'x' });

    const headers = capture.calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, undefined, 'sign-in must not send the old token');
  });

  it('the birthday from "About you" travels with creating and with joining', async () => {
    // Neither request used to carry it, which is how every adult's birthday was
    // dropped between the first onboarding screen and the member row.
    const capture = { calls: [] as { url: string; init: RequestInit }[] };
    const api = apiReturning({ id: 'fam_1', name: 'The Bergs', members: [], groups: [] }, capture);
    const birthday = '1970-03-14T10:00:00.000Z';

    await api.createFamily({ name: 'The Bergs', birthDate: birthday });
    await api.acceptInvitation('FAM-J4K7', { birthDate: birthday });

    const [create, accept] = capture.calls;
    assert.equal(create.url, `${BASE}/families`);
    assert.equal(JSON.parse(String(create.init.body)).birthDate, birthday);
    assert.equal(accept.url, `${BASE}/invitations/FAM-J4K7/accept`);
    assert.equal(JSON.parse(String(accept.init.body)).birthDate, birthday);
  });
});
