import type { FamilyEvent } from './types';

/**
 * A LIFE STORY (docs/07-IMPROVEMENTS.md item 77).
 *
 * The weekly question asks the whole family the same thing; this asks one
 * person, in order, the questions a grandchild will one day wish somebody had
 * asked. Each answer is an event ABOUT that person - they are its participant
 * - with the question's key as its `promptKey`: the mechanism the weekly
 * question already uses, so the story needs no table of its own. The composer
 * leads with the microphone, because telling is easier than writing at eighty.
 *
 * The keys begin "ls-" so they can never be mistaken for a weekly question's,
 * and fit the server's PROMPT_KEY pattern. The words live in i18n as
 * `lifestory.q.<key without ls->`.
 */

export const CHAPTERS = [
  { id: 'childhood', keys: ['ls-born', 'ls-parents', 'ls-home', 'ls-games', 'ls-school'] },
  { id: 'youth', keys: ['ls-dream', 'ls-friends', 'ls-music'] },
  { id: 'love', keys: ['ls-met', 'ls-wedding', 'ls-first-home', 'ls-children'] },
  { id: 'work', keys: ['ls-first-job', 'ls-work', 'ls-hard-times'] },
  { id: 'wisdom', keys: ['ls-change', 'ls-advice', 'ls-remember', 'ls-grateful'] },
] as const;

export type ChapterId = (typeof CHAPTERS)[number]['id'];
export type LifeStoryKey = (typeof CHAPTERS)[number]['keys'][number];

export const LIFE_STORY_KEYS: readonly LifeStoryKey[] = CHAPTERS.flatMap((c) => [...c.keys]);

export function isLifeStoryKey(key: unknown): key is LifeStoryKey {
  return typeof key === 'string' && (LIFE_STORY_KEYS as readonly string[]).includes(key);
}

export function chapterOf(key: LifeStoryKey): ChapterId {
  return CHAPTERS.find((c) => (c.keys as readonly string[]).includes(key))!.id;
}

export interface ChapterProgress {
  id: ChapterId;
  questions: { key: LifeStoryKey; answer?: FamilyEvent }[];
  answered: number;
}

/**
 * One person's story, chapter by chapter: every question, with the answer to
 * it where there is one. An answer is an entry about them that carries the
 * question's key; when a question was answered twice, the first answer stands
 * and the second is still in the chronicle.
 */
export function lifeStory(events: readonly FamilyEvent[], memberId: string): ChapterProgress[] {
  const answers = new Map<string, FamilyEvent>();
  const theirs = events
    .filter((e) => e.participantMemberIds.includes(memberId) && isLifeStoryKey(e.promptKey))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const event of theirs) {
    if (!answers.has(event.promptKey as string)) answers.set(event.promptKey as string, event);
  }

  return CHAPTERS.map((chapter) => {
    const questions = chapter.keys.map((key) => ({ key, answer: answers.get(key) }));
    return { id: chapter.id, questions, answered: questions.filter((q) => q.answer).length };
  });
}

/** The first question still open, in order - what "answer the next one" opens. */
export function nextQuestion(events: readonly FamilyEvent[], memberId: string): LifeStoryKey | null {
  for (const chapter of lifeStory(events, memberId)) {
    const open = chapter.questions.find((q) => !q.answer);
    if (open) return open.key;
  }
  return null;
}
