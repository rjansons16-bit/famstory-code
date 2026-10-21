import assert from 'node:assert/strict';

import type { Wish } from './types';
import { mayClaim, wishesVisibleTo } from './wishes';

/** The surprise is the feature: every leak of it is a test here. */

const list: Wish[] = [
  { id: 'w1', text: 'A warm scarf', addedByMemberId: 'anna', claimedByMemberId: 'vera', createdAt: '' },
  { id: 'w2', text: 'The blue one', addedByMemberId: 'vera', claimedByMemberId: null, createdAt: '' },
];

describe('wishesVisibleTo', () => {
  it('shows the owner only what they wrote, and no claims', () => {
    const seen = wishesVisibleTo(list, 'anna', 'anna');
    assert.deepEqual(
      seen.map((w) => w.id),
      ['w1'],
    );
    assert.equal(seen[0].claimedByMemberId, null);
  });

  it('shows everybody else every line and who is getting it', () => {
    const seen = wishesVisibleTo(list, 'anna', 'martin');
    assert.equal(seen.length, 2);
    assert.equal(seen[0].claimedByMemberId, 'vera');
  });

  it('shows nothing to nobody', () => {
    assert.deepEqual(wishesVisibleTo(list, 'anna', undefined), []);
  });
});

describe('mayClaim', () => {
  it('never from your own list', () => {
    assert.equal(mayClaim(list[1], 'anna', 'anna'), false);
  });

  it('a free line, or your own claim to let go of', () => {
    assert.equal(mayClaim(list[1], 'anna', 'martin'), true);
    assert.equal(mayClaim(list[0], 'anna', 'vera'), true);
  });

  it('not a line somebody else is getting', () => {
    assert.equal(mayClaim(list[0], 'anna', 'martin'), false);
  });
});
