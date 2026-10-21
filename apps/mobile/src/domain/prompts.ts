import type { FamilyEvent } from './types';

/**
 * THE QUESTION OF THE WEEK (docs/07-IMPROVEMENTS.md item 52).
 *
 * The retention problem is that between events there is nothing to do, and a
 * new family has no archive for "On this day" to remind them of. A question -
 * "Where did you live when you were ten?" - answered as a timeline entry is
 * how a chronicle gets the stories nobody would otherwise write down.
 *
 * Rule-based and local, like everything else the MVP calls AI: a fixed list,
 * in order, the same question for the whole family in the same week, so it is
 * something to talk about as well as to write. The words live in i18n
 * (`prompt.<key>`); the key is what an answer is saved with (`promptKey`), so
 * the card knows it has been answered without a table of its own.
 */
export const PROMPT_KEYS = [
  'childhood-home',
  'first-memory',
  'grandparents',
  'sunday-meal',
  'favourite-toy',
  'first-job',
  'how-we-met',
  'best-teacher',
  'family-recipe',
  'first-trip',
  'holiday-tradition',
  'song',
  'neighbourhood',
  'school-day',
  'naming',
  'summer',
  'pet',
  'friendship',
  'first-home',
  'wedding',
  'advice',
  'courage',
  'heirloom',
  'money',
  'night-out',
  'changed-mind',
  'hardest-year',
  'proudest',
  'lesson',
  'today',
] as const;

export type PromptKey = (typeof PROMPT_KEYS)[number];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * This week's question for a family: counted in whole weeks from the day the
 * family was made, so everybody in it gets the same one, and it changes on
 * the same day of the week for all of them. After the last, the list begins
 * again - by then there is an archive for "On this day" to work with.
 */
export function promptForWeek(familyCreatedAt: string, now: Date = new Date()): PromptKey {
  const started = Date.parse(familyCreatedAt);
  const weeks = Number.isNaN(started) ? 0 : Math.max(0, Math.floor((now.getTime() - started) / WEEK_MS));
  return PROMPT_KEYS[weeks % PROMPT_KEYS.length];
}

/** Has this person already written an answer to this question? */
export function hasAnswered(
  events: readonly FamilyEvent[],
  key: PromptKey,
  memberId: string | undefined,
): boolean {
  if (!memberId) return false;
  return events.some((e) => e.promptKey === key && e.authorMemberId === memberId);
}

export function isPromptKey(value: unknown): value is PromptKey {
  return typeof value === 'string' && (PROMPT_KEYS as readonly string[]).includes(value);
}
