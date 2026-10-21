import assert from 'node:assert/strict';
import { request } from 'node:http';

import type { Visibility } from '@/domain/types';

import { FamStoryApi } from './api';
import { HttpClient, type TokenStore } from './http';

/**
 * THE APP'S OWN CLIENT AGAINST A LIVE API (docs/07-IMPROVEMENTS.md item 12).
 *
 * The smoke test (apps/api/test/smoke.ts) proves the server over raw HTTP. It
 * cannot see the other half of the seam: `toEvent`, `toMember` and the rest of
 * api.ts, which turn the server's rows into what the screens read - and that is
 * where the bugs lived. Tags that vanished on the next refresh (item 59) were
 * saved and returned perfectly; the app dropped them on the way in.
 *
 * So this sends through FamStoryApi and HttpClient exactly as the app does, and
 * checks what comes back in the app's own types.
 *
 *     npm --prefix apps/mobile run test:integration
 *
 * Skipped unless FAMSTORY_API_URL is set, so `npm test` never needs a server.
 * One run registers one account (registration is limited to five an hour per
 * address), on @example.test, which the KPI report leaves out.
 */

const BASE = process.env.FAMSTORY_API_URL;
const live = BASE ? describe : describe.skip;

/**
 * The test runner replaces `fetch` with a mock, so the requests go out through
 * Node's own http instead - only as much of `fetch` as HttpClient uses.
 */
function nodeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const req = request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method: init.method ?? 'GET',
        headers: init.headers as Record<string, string>,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            headers: { get: (name: string) => (res.headers[name.toLowerCase()] as string) ?? null },
            text: async () => body,
            json: async () => JSON.parse(body),
          } as unknown as Response);
        });
      },
    );
    req.on('error', reject);
    if (typeof init.body === 'string') req.write(init.body);
    req.end();
  });
}

function memoryTokens(): TokenStore {
  return {
    accessToken: null,
    refreshToken: null,
    save(pair) {
      this.accessToken = pair.accessToken;
      this.refreshToken = pair.refreshToken;
    },
    clear() {
      this.accessToken = null;
      this.refreshToken = null;
    },
  };
}

live("The app's client against a live API", () => {
  const stamp = Date.now();
  const tokens = memoryTokens();
  const api = new FamStoryApi(new HttpClient({ baseUrl: BASE ?? '', tokens, fetchImpl: nodeFetch as typeof fetch }), BASE ?? '');

  let familyId = '';
  let myMemberId = '';
  let parentsGroupId = '';
  let childId = '';

  beforeAll(async () => {
    const auth = await api.register({
      email: `integration_${stamp}@example.test`,
      password: 'Integration2026!',
      displayName: 'Ilze',
      locale: 'lv',
    });
    await tokens.save(auth);

    const snapshot = await api.createFamily({ name: 'Integration family' });
    familyId = snapshot.family.id;
    myMemberId = snapshot.members[0].id;
    parentsGroupId = snapshot.groups.find((g) => g.isSystem && g.icon === 'parents')?.id ?? '';
  }, 30_000);

  it('the family comes back with its admin and its three groups', async () => {
    const snapshot = await api.getFamily(familyId);
    assert.equal(snapshot.family.name, 'Integration family');
    assert.equal(snapshot.members.length, 1);
    assert.equal(snapshot.members[0].role, 'admin');
    assert.equal(snapshot.groups.filter((g) => g.isSystem).length, 3);
    assert.ok(parentsGroupId, 'a Parents group');
  });

  it('an event reads back as it was written - tags, repeat, audience, people', async () => {
    const audience: Visibility = { kind: 'custom', groupIds: [parentsGroupId], memberIds: [myMemberId] };
    const made = await api.createEvent(familyId, {
      title: 'Swimming practice',
      description: 'Bring the blue towel',
      startsAt: '2026-10-20T15:00:00.000Z',
      endsAt: '2026-10-20T16:30:00.000Z',
      categoryId: 'activity',
      tags: ['Pool', 'Tuesdays'],
      participantMemberIds: [myMemberId],
      visibility: audience,
      repeat: 'weekly',
      repeatTimeZone: 'Europe/Riga',
      reminder: { minutesBefore: 60 },
    });

    // Read it back cold, the way a refresh does - not from the create reply.
    const [again] = (await api.listEvents(familyId, { repeating: true })).items.filter((e) => e.id === made.id);
    for (const event of [made, again]) {
      assert.equal(event.title, 'Swimming practice');
      assert.equal(event.description, 'Bring the blue towel');
      assert.deepEqual([...(event.tags ?? [])].sort(), ['Pool', 'Tuesdays']);
      assert.equal(event.repeat, 'weekly');
      assert.equal(event.repeatTimeZone, 'Europe/Riga');
      assert.deepEqual(event.participantMemberIds, [myMemberId]);
      assert.equal(event.visibility.kind, 'custom');
      assert.deepEqual(event.visibility.groupIds, [parentsGroupId]);
      assert.equal(event.reminder?.minutesBefore, 60);
      assert.equal(event.endsAt, '2026-10-20T16:30:00.000Z');
    }
  });

  it('a child in an event narrows it to the parents, and the app is told so', async () => {
    const child = await api.createChild(familyId, { displayName: 'Emīlija' });
    childId = child.id;
    assert.equal(child.role, 'child');

    const event = await api.createEvent(familyId, {
      title: 'Zobārsts',
      startsAt: new Date(Date.now() + 864e5).toISOString(),
      categoryId: 'health',
      participantMemberIds: [childId],
    });
    assert.equal(event.visibility.kind, 'groups');
    assert.deepEqual(event.visibility.groupIds, [parentsGroupId]);
  });

  it('a skipped week and an edit survive the round trip', async () => {
    const made = await api.createEvent(familyId, {
      title: 'Piano',
      startsAt: '2026-10-21T14:00:00.000Z',
      categoryId: 'education',
      repeat: 'weekly',
      repeatTimeZone: 'Europe/Riga',
    });
    const edited = await api.updateEvent(familyId, made.id, {
      title: 'Piano lesson',
      repeatSkips: ['2026-10-28'],
      tags: ['Music'],
    });
    const cold = await api.getEvent(familyId, made.id);
    for (const event of [edited, cold]) {
      assert.equal(event.title, 'Piano lesson');
      assert.deepEqual(event.repeatSkips, ['2026-10-28']);
      assert.deepEqual(event.tags, ['Music']);
    }
  });

  it('comments and reactions read back on the event', async () => {
    const event = await api.createEvent(familyId, {
      title: 'First day of school',
      startsAt: '2026-09-01T06:00:00.000Z',
      categoryId: 'education',
    });
    await api.addComment(familyId, event.id, 'Such a big bag!');
    await api.toggleReaction(familyId, event.id, 'heart');

    const comments = await api.listComments(familyId, event.id);
    assert.equal(comments.length, 1);
    assert.equal(comments[0].body, 'Such a big bag!');

    const cold = await api.getEvent(familyId, event.id);
    assert.equal(cold.commentCount, 1);
    assert.equal(cold.reactions.filter((r) => r.kind === 'heart').length, 1);

    // The app puts the reply of an edit on screen in place of its own copy,
    // so the reply has to keep what the edit did not touch.
    const edited = await api.updateEvent(familyId, event.id, { title: 'The first day of school' });
    assert.equal(edited.commentCount, 1);
    assert.equal(edited.reactions.length, 1);
  });

  it("a create's reply carries its reminder - the app shows that reply", async () => {
    const made = await api.createEvent(familyId, {
      title: 'Parent-teacher evening',
      startsAt: new Date(Date.now() + 7 * 864e5).toISOString(),
      categoryId: 'education',
      reminder: { minutesBefore: 1440 },
    });
    assert.equal(made.reminder?.minutesBefore, 1440);
  });

  it('search finds by the words, and misses what is not there', async () => {
    const found = await api.listEvents(familyId, { q: 'towel' });
    assert.deepEqual(found.items.map((e) => e.title), ['Swimming practice']);
    const none = await api.listEvents(familyId, { q: 'nothing-like-this' });
    assert.equal(none.items.length, 0);
  });

  it("a wish for the child, and the child's list reads it back", async () => {
    await api.addWish(familyId, childId, 'A red bicycle');
    const wishes = await api.listWishes(familyId, childId);
    assert.deepEqual(wishes.map((w) => w.text), ['A red bicycle']);
  });

  it('the usage switch is kept on the account', async () => {
    await api.updateMe({ shareUsageStats: false });
    const me = await api.me();
    assert.equal(me.shareUsageStats, false);
  });

  it('the export carries the account and its family', async () => {
    const exported = JSON.stringify(await api.exportMyData());
    assert.ok(exported.includes(`integration_${stamp}@example.test`));
    assert.ok(exported.includes('Integration family'));
  });
});
