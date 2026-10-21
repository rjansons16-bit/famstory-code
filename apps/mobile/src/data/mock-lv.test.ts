import assert from 'node:assert/strict';

import { mockComments, mockEvents, mockMembers, mockNotifications, mockWishes } from './mock';
import { sampleComments, sampleEvents, sampleMembers, sampleNotifications, sampleWishes } from './mock-lv';

/**
 * The sample family in Latvian (data/mock-lv.ts): every one of its own words
 * has a Latvian, the English comes back, and nothing added to the demo is
 * rewritten. A sample entry added to mock.ts without its Latvian fails here,
 * rather than showing up in English in a Latvian demo.
 */
describe('the sample family in Latvian', () => {
  it('has every entry of its own in Latvian', () => {
    const latvian = sampleEvents(mockEvents, 'lv');
    latvian.forEach((event, i) => assert.notEqual(event.title, mockEvents[i].title, event.id));
  });

  it('goes back to the English it came with', () => {
    const back = sampleEvents(sampleEvents(mockEvents, 'lv'), 'en');
    assert.deepEqual(
      back.map((e) => [e.title, e.description, e.tags]),
      mockEvents.map((e) => [e.title, e.description, e.tags]),
    );
  });

  it('leaves an entry somebody added to the demo as they wrote it', () => {
    const mine = { ...mockEvents[0], id: 'evt_mine', title: 'Mūsu pirmais', tags: ['Mans'] };
    assert.deepEqual(sampleEvents([mine], 'lv')[0], mine);
    assert.deepEqual(sampleEvents([mine], 'en')[0], mine);
  });

  it('names the children and Martin in Latvian, and the rest as they are', () => {
    const names = sampleMembers(mockMembers, 'lv').map((m) => m.displayName);
    assert.deepEqual(names, ['Anna', 'Mārtiņš', 'Emīlija', 'Roberts', 'Vera']);
    assert.deepEqual(
      sampleMembers(sampleMembers(mockMembers, 'lv'), 'en').map((m) => m.displayName),
      mockMembers.map((m) => m.displayName),
    );
  });

  it('has the comments, the notifications with words and the wishes in Latvian', () => {
    sampleComments(mockComments, 'lv').forEach((c, i) => assert.notEqual(c.body, mockComments[i].body, c.id));
    sampleNotifications(mockNotifications, 'lv').forEach((n, i) => {
      if (mockNotifications[i].title !== undefined) assert.notEqual(n.title, mockNotifications[i].title, n.id);
      else assert.deepEqual(n, mockNotifications[i]);
    });
    const wishes = Object.values(mockWishes).flat();
    sampleWishes(wishes, 'lv').forEach((w, i) => assert.notEqual(w.text, wishes[i].text, w.id));
  });
});
