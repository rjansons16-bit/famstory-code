import { t } from '@/i18n';
import type { Member } from './types';

/**
 * WHAT A PERSON LIKES - asked once in onboarding, changed on the profile, and
 * read by the gift ideas before their birthday (domain/gifts.ts,
 * docs/07-IMPROVEMENTS.md item 91).
 *
 * A fixed list, not free text: a key from here says "gardening" and nothing
 * else, while a sentence could say anything about anybody - and would be one
 * more thing about a person, and a child, kept in a family's records. Each key
 * is named in the reader's language when it is drawn.
 *
 * The same list as INTEREST_KEYS in apps/api/src/common/interests.ts, which
 * drops any key it does not know.
 */
export const INTEREST_KEYS = [
  'garden',
  'cooking',
  'baking',
  'reading',
  'music',
  'sport',
  'nature',
  'fishing',
  'travel',
  'photography',
  'crafts',
  'drawing',
  'games',
  'tech',
  'animals',
  'films',
  'coffee',
  'wellness',
  'diy',
  'building',
] as const;

export type InterestKey = (typeof INTEREST_KEYS)[number];

/** A person, not a catalogue. */
export const MAX_INTERESTS = 12;

const KNOWN = new Set<string>(INTEREST_KEYS);

export function isInterestKey(value: unknown): value is InterestKey {
  return typeof value === 'string' && KNOWN.has(value);
}

/** Known keys only, each once, at most MAX_INTERESTS, in the order given - as the server keeps them. */
export function cleanInterests(values: readonly unknown[] | undefined): InterestKey[] {
  const kept: InterestKey[] = [];
  for (const value of values ?? []) {
    if (isInterestKey(value) && !kept.includes(value)) kept.push(value);
    if (kept.length === MAX_INTERESTS) break;
  }
  return kept;
}

/** One key in or out of a list, keeping the limit: a full list takes nothing more. */
export function toggleInterest(list: readonly InterestKey[], key: InterestKey): InterestKey[] {
  if (list.includes(key)) return list.filter((k) => k !== key);
  if (list.length >= MAX_INTERESTS) return [...list];
  return [...list, key];
}

/** The key's name in the language the app is speaking. Called at render, never at import. */
export function interestLabel(key: InterestKey): string {
  return t(`interest.${key}` as const);
}

/**
 * Who may change somebody's interests: the person themselves, and for a
 * child's profile - which has no account to do it from - the adult who
 * manages it or an admin. The server holds the same rule
 * (families.service.ts, updateChildInterests); this only decides what to draw.
 */
export function mayEditInterests(viewer: Member, member: Member): boolean {
  if (viewer.id === member.id) return true;
  if (member.role !== 'child') return false;
  return viewer.role === 'admin' || member.managedByMemberId === viewer.id;
}
