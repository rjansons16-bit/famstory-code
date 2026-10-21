import assert from 'node:assert/strict';

import { useLocale } from '@/data/locale';
import { ageBand, giftIdeaText, giftIdeasFor, giftSearchUrl, interestsFromEntries } from './gifts';
import { cleanInterests, interestLabel, MAX_INTERESTS, toggleInterest } from './interests';
import type { FamilyEvent, Member, Wish } from './types';

/**
 * Gift ideas are rules over what the family already sees: what somebody
 * chose, what the entries about them keep saying, their age. These pin the
 * order a reader gets them in, and the ways an idea must NOT appear.
 */

afterEach(() => {
  useLocale.setState({ locale: 'en' });
});

const NOW = new Date(2026, 8, 29, 12);

function member(patch: Partial<Member> & { id: string }): Member {
  return {
    familyId: 'f1',
    userId: null,
    displayName: patch.id,
    role: 'member',
    status: 'active',
    groupIds: [],
    joinedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

function event(patch: Partial<FamilyEvent> & { id: string; title: string }): FamilyEvent {
  return {
    familyId: 'f1',
    startsAt: '2026-06-01T10:00:00.000Z',
    allDay: false,
    categoryId: 'other',
    participantMemberIds: ['vera'],
    authorMemberId: 'anna',
    visibility: { kind: 'family' },
    attachments: [],
    reactions: [],
    commentCount: 0,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    isMilestone: false,
    ...patch,
  };
}

const vera = member({ id: 'vera', birthDate: '1958-10-04', interests: ['garden', 'reading'] });

describe('Gift ideas', () => {
  it('are for somebody else: nobody gets ideas for themselves', () => {
    assert.deepEqual(giftIdeasFor({ member: vera, viewerId: 'vera', now: NOW }), []);
    assert.deepEqual(giftIdeasFor({ member: vera, viewerId: undefined, now: NOW }), []);
  });

  it('give each chosen interest one idea before any gets a second', () => {
    const ideas = giftIdeasFor({ member: vera, viewerId: 'anna', now: NOW });

    assert.deepEqual(
      ideas.map((i) => i.key),
      [
        'gift.idea.garden.1',
        'gift.idea.reading.1',
        'gift.idea.garden.2',
        'gift.idea.reading.2',
        'gift.idea.garden.3',
        'gift.idea.reading.3',
      ],
    );
    assert.ok(ideas.every((i) => i.source === 'interest'));
  });

  it('add what the entries about the person keep coming back to - in either language', () => {
    const events = [
      event({ id: 'e1', title: 'Makšķerējām pie ezera' }),
      event({ id: 'e2', title: 'First fishing trip of the year' }),
    ];
    const ideas = giftIdeasFor({ member: vera, viewerId: 'anna', events, now: NOW, limit: 3 });

    assert.deepEqual(
      ideas.map((i) => [i.key, i.source]),
      [
        ['gift.idea.garden.1', 'interest'],
        ['gift.idea.reading.1', 'interest'],
        ['gift.idea.fishing.1', 'family'],
      ],
    );
  });

  it('do not make a hobby out of one entry, or out of what somebody only wrote', () => {
    const once = [event({ id: 'e1', title: 'A weekend with two dogs' })];
    const written = [
      event({ id: 'e1', title: 'Swimming practice', participantMemberIds: ['emily'] }),
      event({ id: 'e2', title: 'Swimming lesson', participantMemberIds: ['emily'] }),
    ];

    assert.deepEqual(interestsFromEntries('vera', once), []);
    // Vera wrote both - they are about Emily.
    assert.deepEqual(interestsFromEntries('vera', written.map((e) => ({ ...e, authorMemberId: 'vera' }))), []);
    assert.deepEqual(interestsFromEntries('emily', written), ['sport']);
  });

  it('read nothing into a sealed time capsule, or into a cake', () => {
    const events = [
      event({ id: 'e1', title: 'Fishing', sealed: true }),
      event({ id: 'e2', title: 'Fishing', sealed: true }),
      event({ id: 'e3', title: 'Birthday cake' }),
      event({ id: 'e4', title: 'Another cake' }),
    ];
    assert.deepEqual(interestsFromEntries('vera', events), []);
  });

  it('count a trip filed under travel, whatever it is called', () => {
    const events = [
      event({ id: 'e1', title: 'Rīga', categoryId: 'travel' }),
      event({ id: 'e2', title: 'Tallinn', categoryId: 'travel' }),
    ];
    assert.deepEqual(interestsFromEntries('vera', events), ['travel']);
  });

  it("follow a child's age when nothing else is known", () => {
    const robert = member({ id: 'robert', role: 'child', birthDate: '2023-06-10' });
    const ideas = giftIdeasFor({ member: robert, viewerId: 'anna', now: NOW });

    assert.deepEqual(
      ideas.map((i) => i.key),
      ['gift.age.toddler.1', 'gift.age.toddler.2', 'gift.age.toddler.3'],
    );
  });

  it('are never fewer than three', () => {
    const stranger = member({ id: 'james' });
    const ideas = giftIdeasFor({ member: stranger, viewerId: 'anna', now: NOW });
    assert.deepEqual(
      ideas.map((i) => [i.key, i.source]),
      [
        ['gift.general.1', 'general'],
        ['gift.general.2', 'general'],
        ['gift.general.3', 'general'],
      ],
    );
  });

  it('do not offer again an idea somebody already took onto the wish list', () => {
    const taken: Wish = {
      id: 'w1',
      text: giftIdeaText({ key: 'gift.idea.garden.1', source: 'interest' }),
      addedByMemberId: 'martin',
      claimedByMemberId: 'martin',
      createdAt: '',
    };
    const ideas = giftIdeasFor({ member: vera, viewerId: 'anna', wishes: [taken], now: NOW });
    assert.equal(ideas[0].key, 'gift.idea.reading.1');
    assert.ok(!ideas.some((i) => i.key === 'gift.idea.garden.1'));
  });

  it('are written in the reader’s language', () => {
    const idea = { key: 'gift.idea.garden.1' as const, source: 'interest' as const };
    const english = giftIdeaText(idea);
    useLocale.setState({ locale: 'lv' });
    assert.notEqual(giftIdeaText(idea), english);
  });
});

describe('Age bands', () => {
  it('go by whole years on the day', () => {
    assert.equal(ageBand('2025-10-01', NOW), 'baby');
    assert.equal(ageBand('2024-09-30', NOW), 'baby');
    assert.equal(ageBand('2024-09-29', NOW), 'toddler');
    assert.equal(ageBand('2019-05-01', NOW), 'child');
    assert.equal(ageBand('2011-01-01', NOW), 'teen');
    assert.equal(ageBand('1990-01-01', NOW), null);
    assert.equal(ageBand(undefined, NOW), null);
  });
});

describe('Searching for an idea', () => {
  it('sends the words and nothing else', () => {
    assert.equal(
      giftSearchUrl('Dārza cimdi & lāpstiņa'),
      'https://www.google.com/search?q=D%C4%81rza%20cimdi%20%26%20l%C4%81psti%C5%86a',
    );
  });
});

describe('Interests', () => {
  it('keep known keys only, once each, and not too many', () => {
    assert.deepEqual(cleanInterests(['garden', 'garden', 'astrology', 42, 'music']), ['garden', 'music']);

    const everything = cleanInterests([
      'garden', 'cooking', 'baking', 'reading', 'music', 'sport', 'nature',
      'fishing', 'travel', 'photography', 'crafts', 'drawing', 'games', 'tech',
    ]);
    assert.equal(everything.length, MAX_INTERESTS);
  });

  it('go in and out with a tap, and a full list takes nothing more', () => {
    assert.deepEqual(toggleInterest(['garden'], 'music'), ['garden', 'music']);
    assert.deepEqual(toggleInterest(['garden', 'music'], 'garden'), ['music']);

    const full = cleanInterests([
      'garden', 'cooking', 'baking', 'reading', 'music', 'sport',
      'nature', 'fishing', 'travel', 'photography', 'crafts', 'drawing',
    ]);
    assert.deepEqual(toggleInterest(full, 'games'), full);
  });

  it('are named in the reader’s language', () => {
    assert.equal(interestLabel('garden'), 'Gardening');
    useLocale.setState({ locale: 'lv' });
    assert.equal(interestLabel('garden'), 'Dārzs');
  });
});
