import { BadRequestException } from '@nestjs/common';

/**
 * WHAT PEOPLE TYPE, CHECKED ON THE WAY IN.
 *
 * The request bodies are TypeScript interfaces (events.dto.ts says why), so
 * the ValidationPipe has nothing to check them against, and until these
 * helpers nothing did: an empty title was saved as one, a number where text
 * belongs was a 500 from Prisma, an unknown category broke every family
 * member's timeline (the app looks the category up and found nothing), and a
 * comment could be as long as the request size limit allows.
 *
 * The limits are generous - about twice the app's own fields - because their
 * job is to stop what no field would send, not to argue with a long sentence
 * the app let somebody dictate.
 */
export const LIMITS = {
  /** The composer's field allows 120. */
  eventTitle: 200,
  eventDescription: 20_000,
  /** The tag picker allows 24. */
  tag: 40,
  tags: 30,
  comment: 5_000,
  /** A child's name; the app's field allows 60. */
  personName: 100,
  groupName: 60,
} as const;

/**
 * The categories the app knows (apps/mobile/src/domain/categories.ts). Kept
 * twice on purpose: the app draws each one, and one it does not know is a
 * timeline it cannot draw.
 */
export const CATEGORY_IDS = [
  'development',
  'education',
  'milestone',
  'health',
  'celebration',
  'travel',
  'activity',
  'chore',
  'finance',
  'other',
] as const;

function refuse(code: string, message: string): never {
  throw new BadRequestException({ code, message });
}

/** Text that must be there: trimmed, 1 to `max` characters. */
export function requiredText(value: unknown, max: number, code: string, what: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) refuse(code, `${what} is 1 to ${max} characters.`);
  return text;
}

/**
 * Text that may be left out. Not sent stays `undefined` (an update leaves it
 * alone); `null` or only spaces is `null` (cleared); anything else is
 * trimmed, at most `max` characters.
 */
export function optionalText(value: unknown, max: number, code: string, what: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') refuse(code, `${what} is text.`);
  const text = value.trim();
  if (text.length > max) refuse(code, `${what} is at most ${max} characters.`);
  return text || null;
}

/** An instant the app sends as ISO text. */
export function instant(value: unknown, what: string): Date {
  const date = typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) refuse('invalid_date', `${what} is not a date.`);
  return date;
}

/** One of the categories above. */
export function categoryId(value: unknown): string {
  if (typeof value !== 'string' || !(CATEGORY_IDS as readonly string[]).includes(value)) {
    refuse('invalid_category', `The category is one of: ${CATEGORY_IDS.join(', ')}.`);
  }
  return value;
}

/** The family's own labels: a list of short texts, each once. */
export function tagList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > LIMITS.tags) {
    refuse('invalid_tags', `Tags are a list of at most ${LIMITS.tags}.`);
  }
  return [...new Set(value.map((tag) => requiredText(tag, LIMITS.tag, 'invalid_tags', 'A tag')))];
}
