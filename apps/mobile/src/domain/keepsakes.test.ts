import assert from 'node:assert/strict';

import { capsuleOptions, isSealed } from './capsules';
import { FILM_SLIDES, yearFilm } from './film';
import { isLifeStoryKey, lifeStory, nextQuestion, LIFE_STORY_KEYS } from './lifestory';
import { booksFor, isPendingSurprise, surprisesToAsk, wishesFor } from './surprises';
import type { Attachment, FamilyEvent, Member } from './types';
import { growingUp, normalizedTitle, traditions } from './yearly';

/**
 * The keepsakes: capsules, surprises, a life story, what repeats across
 * years and the year's film. What they share is the rule that a closed
 * capsule and a surprise not yet revealed are nobody's to see yet.
 */

function photo(id: string): Attachment {
  return { id, kind: 'image', url: `https://x/${id}.jpg` };
}

function event(patch: Partial<FamilyEvent> & { id: string; startsAt: string }): FamilyEvent {
  return {
    familyId: 'f1',
    title: patch.id,
    allDay: false,
    categoryId: 'other',
    participantMemberIds: [],
    authorMemberId: 'mem_anna',
    visibility: { kind: 'family' },
    attachments: [],
    reactions: [],
    commentCount: 0,
    createdAt: patch.startsAt,
    updatedAt: patch.startsAt,
    isMilestone: false,
    ...patch,
  };
}

function member(patch: Partial<Member> & { id: string }): Member {
  return {
    familyId: 'f1',
    displayName: patch.id,
    role: 'member',
    status: 'active',
    groupIds: [],
    joinedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  } as Member;
}

const NOW = new Date(2026, 8, 26, 12);

describe('Time capsules', () => {
  const capsule = event({
    id: 'letter',
    startsAt: '2026-09-01T10:00:00.000Z',
    sealedUntil: new Date(2044, 4, 3, 9).toISOString(),
  });

  it('are an envelope to everybody but their author until the day', () => {
    assert.equal(isSealed(capsule, 'mem_martin', NOW), true);
    assert.equal(isSealed(capsule, 'mem_anna', NOW), false);
    assert.equal(isSealed(capsule, 'mem_martin', new Date(2044, 4, 4)), false);
  });

  it('take the server at its word when it sent the envelope', () => {
    assert.equal(isSealed({ ...capsule, sealed: true }, 'mem_anna', NOW), true);
  });

  it('offer a year, five, ten - and a child turning eighteen, while that is ahead', () => {
    const options = capsuleOptions(
      [
        member({ id: 'robert', role: 'child', birthDate: '2023-10-02T12:00:00.000Z' }),
        member({ id: 'grown', role: 'child', birthDate: '2001-01-01T12:00:00.000Z' }),
        member({ id: 'anna', birthDate: '1990-12-19T12:00:00.000Z' }),
      ],
      NOW,
    );
    assert.deepEqual(options.map((o) => o.key), ['years-1', 'years-5', 'years-10', 'adult-robert']);
    const robert = options.find((o) => o.member?.id === 'robert')!;
    assert.equal(robert.at.getFullYear(), 2041);
    assert.equal(robert.at.getMonth(), 9);
    assert.equal(robert.at.getDate(), 2);
  });
});

describe('Birthday surprises', () => {
  const vera = member({ id: 'vera', birthDate: '1958-10-01T12:00:00.000Z' });
  const anna = member({ id: 'anna', birthDate: '1990-12-19T12:00:00.000Z' });
  const morning = new Date(2026, 9, 1, 7);
  const wish = (id: string, author: string, revealAt = morning) =>
    event({ id, startsAt: revealAt.toISOString(), authorMemberId: author, hiddenFromMemberId: 'vera', revealAt: revealAt.toISOString() });

  it('ask the family to write for a birthday in the next two weeks, never for their own', () => {
    const asks = surprisesToAsk([vera, anna], [wish('w1', 'martin')], 'anna', NOW);
    assert.deepEqual(asks.map((a) => a.birthday.member.id), ['vera']);
    assert.equal(asks[0].revealAt, morning.toISOString());
    assert.equal(asks[0].wishes.length, 1);

    assert.deepEqual(surprisesToAsk([vera], [], 'vera', NOW), []);
  });

  it('keep each birthday\'s wishes to that day', () => {
    const lastYear = new Date(2025, 9, 1, 7);
    const list = [wish('now', 'martin'), wish('then', 'martin', lastYear)];
    assert.deepEqual(wishesFor(list, 'vera', morning).map((e) => e.id), ['now']);
  });

  it('become a book for their person on the morning, and for a week after', () => {
    const list = [wish('w1', 'martin'), wish('w2', 'anna')];
    assert.deepEqual(booksFor(list, 'vera', NOW), []);

    const onTheDay = new Date(2026, 9, 1, 9);
    const books = booksFor(list, 'vera', onTheDay);
    assert.equal(books.length, 1);
    assert.equal(books[0].wishes.length, 2);

    assert.deepEqual(booksFor(list, 'vera', new Date(2026, 9, 20)), []);
    assert.deepEqual(booksFor(list, 'anna', onTheDay), []);
  });

  it('say they are still a secret, to those who can see them', () => {
    assert.equal(isPendingSurprise(wish('w1', 'martin'), NOW), true);
    assert.equal(isPendingSurprise(wish('w1', 'martin'), new Date(2026, 9, 2)), false);
    assert.equal(isPendingSurprise(event({ id: 'plain', startsAt: NOW.toISOString() }), NOW), false);
  });
});

describe('A life story', () => {
  const answer = (key: string, id: string, createdAt: string) =>
    event({ id, startsAt: createdAt, createdAt, promptKey: key, participantMemberIds: ['vera'] });

  it('asks its questions in order, and knows which are answered', () => {
    const events = [answer('ls-born', 'a1', '2026-01-01T00:00:00Z')];
    const story = lifeStory(events, 'vera');
    assert.equal(story[0].id, 'childhood');
    assert.equal(story[0].answered, 1);
    assert.equal(nextQuestion(events, 'vera'), 'ls-parents');
  });

  it('is about one person: an answer about somebody else is theirs', () => {
    const aboutAnna = event({ id: 'x', startsAt: '2026-01-01T00:00:00Z', promptKey: 'ls-born', participantMemberIds: ['anna'] });
    assert.equal(nextQuestion([aboutAnna], 'vera'), 'ls-born');
  });

  it('keeps the first answer when a question was answered twice', () => {
    const story = lifeStory(
      [answer('ls-born', 'second', '2026-02-01T00:00:00Z'), answer('ls-born', 'first', '2026-01-01T00:00:00Z')],
      'vera',
    );
    assert.equal(story[0].questions[0].answer?.id, 'first');
  });

  it('never mistakes a weekly question for one of its own', () => {
    assert.equal(isLifeStoryKey('childhood-home'), false);
    assert.ok(LIFE_STORY_KEYS.every((k) => /^ls-[a-z0-9-]{1,37}$/.test(k)));
  });
});

describe('Year after year', () => {
  it('reads a title with the year taken out as the same thing', () => {
    assert.equal(normalizedTitle('Jāņi 2024!'), normalizedTitle('jāņi 2025'));
    assert.equal(normalizedTitle('2025'), '');
  });

  it('finds a tradition in a tag used in two different years, not in one year twice', () => {
    const series = traditions(
      [
        event({ id: 'a', startsAt: '2024-06-23T18:00:00Z', tags: ['Midsummer'], attachments: [photo('a')] }),
        event({ id: 'b', startsAt: '2025-06-23T18:00:00Z', tags: ['midsummer'] }),
        event({ id: 'c', startsAt: '2025-03-01T10:00:00Z', tags: ['Dentist'] }),
        event({ id: 'd', startsAt: '2025-09-01T10:00:00Z', tags: ['Dentist'] }),
      ],
      NOW,
    );
    assert.deepEqual(series.map((s) => s.label), ['Midsummer']);
    assert.deepEqual(series[0].years.map((y) => y.year), [2024, 2025]);
    assert.equal(series[0].years[0].cover?.id, 'a');
  });

  it('does not name the same series twice, by its tag and by its title', () => {
    const series = traditions(
      [
        event({ id: 'a', title: 'Jāņi 2024', startsAt: '2024-06-23T18:00:00Z', tags: ['Jāņi'] }),
        event({ id: 'b', title: 'Jāņi 2025', startsAt: '2025-06-23T18:00:00Z', tags: ['Jāņi'] }),
      ],
      NOW,
    );
    assert.equal(series.length, 1);
    assert.equal(series[0].key, 'tag:jāņi');
  });

  it('never counts a closed capsule or a surprise not yet revealed', () => {
    const series = traditions(
      [
        event({ id: 'a', startsAt: '2024-06-23T18:00:00Z', tags: ['Letter'] }),
        event({ id: 'b', startsAt: '2025-06-23T18:00:00Z', tags: ['Letter'], sealed: true }),
      ],
      NOW,
    );
    assert.deepEqual(series, []);
  });

  it('shows one person growing up, with their age each year', () => {
    const emily = member({ id: 'emily', role: 'child', birthDate: '2019-05-10T12:00:00.000Z' });
    const series = growingUp(
      [
        event({ id: 'a', startsAt: '2025-09-01T08:00:00Z', tags: ['First day'], participantMemberIds: ['emily'] }),
        event({ id: 'b', startsAt: '2026-09-01T08:00:00Z', tags: ['First day'], participantMemberIds: ['emily'] }),
        event({ id: 'c', startsAt: '2024-09-01T08:00:00Z', tags: ['First day'], participantMemberIds: ['robert'] }),
      ],
      emily,
      NOW,
    );
    assert.deepEqual(series[0].years.map((y) => [y.year, y.age]), [[2025, 6], [2026, 7]]);
  });
});

describe('The year in a minute', () => {
  it('is made of that year\'s photographs, in order', () => {
    const slides = yearFilm(
      [
        event({ id: 'b', startsAt: '2026-07-01T10:00:00Z', attachments: [photo('b')] }),
        event({ id: 'a', startsAt: '2026-02-01T10:00:00Z', attachments: [photo('a')] }),
        event({ id: 'none', startsAt: '2026-03-01T10:00:00Z' }),
        event({ id: 'old', startsAt: '2025-03-01T10:00:00Z', attachments: [photo('old')] }),
      ],
      2026,
      NOW,
    );
    assert.deepEqual(slides.map((s) => s.eventId), ['a', 'b']);
  });

  it('keeps to a minute, milestones first and the rest across the months', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      event({
        id: `e${i}`,
        startsAt: new Date(2026, i % 8, 1 + (i % 20), 12).toISOString(),
        attachments: [photo(`p${i}`)],
        isMilestone: i === 39,
      }),
    );
    const slides = yearFilm(many, 2026, NOW);
    assert.equal(slides.length, FILM_SLIDES);
    assert.ok(slides.some((s) => s.eventId === 'e39'));
    assert.equal(new Set(slides.map((s) => new Date(s.startsAt).getMonth())).size, 8);
  });

  it('leaves closed capsules out', () => {
    const slides = yearFilm(
      [event({ id: 'c', startsAt: '2026-02-01T10:00:00Z', attachments: [photo('c')], sealedUntil: '2040-01-01T00:00:00Z' })],
      2026,
      NOW,
    );
    assert.deepEqual(slides, []);
  });
});
