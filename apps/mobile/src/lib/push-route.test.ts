import assert from 'node:assert/strict';

import { routeForPush } from './push-route';

describe('Where a tapped push opens the app', () => {
  it('opens the event it is about', () => {
    assert.equal(routeForPush({ kind: 'event_reminder', eventId: 'cmgabc123' }), '/event/cmgabc123');
  });

  it('opens the bell when it is about no event', () => {
    assert.equal(routeForPush({ kind: 'special_day' }), '/notifications');
    assert.equal(routeForPush(null), '/notifications');
    assert.equal(routeForPush('event_created'), '/notifications');
  });

  it('opens the bell for an id that is not one of ours, rather than a path somebody wrote', () => {
    assert.equal(routeForPush({ eventId: '../settings' }), '/notifications');
    assert.equal(routeForPush({ eventId: 'evt?x=1' }), '/notifications');
    assert.equal(routeForPush({ eventId: 42 }), '/notifications');
  });
});
