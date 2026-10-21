/**
 * WHAT A PERSON LIKES - for gift ideas before their birthday
 * (docs/07-IMPROVEMENTS.md item 91).
 *
 * A fixed list, not free text: a key from here says "gardening" and nothing
 * else, while a sentence could say anything about anybody - and would be one
 * more thing about a person, and a child, kept in a family's records. The app
 * names each key in the reader's language.
 *
 * The same list as INTEREST_KEYS in apps/mobile/src/domain/interests.ts.
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

/**
 * The interests that may be kept: known keys only, each once, at most
 * MAX_INTERESTS, in the order given. Null when the value is not a list at
 * all - a mistake to report, not a list to empty.
 */
export function cleanInterests(value: unknown): InterestKey[] | null {
  if (!Array.isArray(value)) return null;
  const kept: InterestKey[] = [];
  for (const item of value) {
    if (typeof item === 'string' && KNOWN.has(item) && !kept.includes(item as InterestKey)) {
      kept.push(item as InterestKey);
    }
    if (kept.length === MAX_INTERESTS) break;
  }
  return kept;
}
