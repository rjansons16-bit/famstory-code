import { t } from '@/i18n';
import { toDate } from '@/lib/date';
import { INTEREST_KEYS, cleanInterests, type InterestKey } from './interests';
import type { FamilyEvent, Member, Wish } from './types';

/**
 * GIFT IDEAS before somebody's birthday (docs/07-IMPROVEMENTS.md item 91).
 *
 * Rules, not a model: what the person said they like (domain/interests.ts),
 * then what the family's own entries about them keep coming back to, then
 * their age for a child, then a few that suit anybody. Each idea is a line
 * from the app's own list, in the reader's language - nothing is written
 * about anybody, and nothing leaves the device to be worked out.
 *
 * Computed only from what the viewer can already see: their visible events
 * (the same `canSee` as the timeline) and the member row the family reads.
 * A suggestion never does anything by itself - "I'll get this" is a press,
 * and it only puts a line on the wish list, where the person it is for never
 * sees it (domain/wishes.ts).
 */

export type AgeBand = 'baby' | 'toddler' | 'child' | 'teen';

type IdeaNumber = 1 | 2 | 3;

export type GiftIdeaKey =
  | `gift.idea.${InterestKey}.${IdeaNumber}`
  | `gift.age.${AgeBand}.${IdeaNumber}`
  | `gift.general.${IdeaNumber}`;

/** Where an idea came from - said under it, and counted when one is taken. */
export type GiftSource = 'interest' | 'family' | 'age' | 'general';

export interface GiftIdea {
  key: GiftIdeaKey;
  source: GiftSource;
  /** The interest behind it, for 'interest' and 'family'. */
  interest?: InterestKey;
}

/** How far ahead of a birthday the timeline offers ideas: two weeks is time to buy. */
export const GIFT_IDEAS_WINDOW_DAYS = 14;

/** Enough to choose from, few enough to read. */
export const MAX_GIFT_IDEAS = 6;

const NUMBERS: readonly IdeaNumber[] = [1, 2, 3];

/**
 * Word beginnings that say an entry is about an interest, in both languages
 * the app speaks. Beginnings, because Latvian bends its words: "makšķerēja",
 * "makšķerēšana" and "makšķerēt" all start the same.
 *
 * Deliberately absent: cake and photo. Every birthday has a cake and every
 * entry has a photograph; neither says what anybody likes.
 */
const STEMS: Record<InterestKey, readonly string[]> = {
  garden: ['garden', 'dārz', 'stād', 'dēst', 'siltumnīc', 'greenhouse', 'harvest'],
  cooking: ['cook', 'gatavoj', 'recipe', 'recept', 'grill', 'grilē', 'kitchen', 'virtuv'],
  baking: ['bake', 'baking', 'cept', 'cepa', 'cepām', 'cepam', 'cepšan', 'cepum', 'pīrāg', 'piparkūk', 'bread', 'cookie'],
  reading: ['book', 'grāmat', 'reading', 'lasīj', 'lasīt', 'lasām', 'library', 'bibliotēk'],
  music: ['music', 'mūzik', 'concert', 'koncert', 'singing', 'dzied', 'choir', 'piano', 'klavier', 'guitar', 'ģitār', 'violin', 'vijol', 'song', 'dziesm'],
  sport: [
    'sport', 'football', 'futbol', 'hockey', 'hokej', 'basketbal', 'volleyball', 'volejbol', 'tennis', 'tenis',
    'swim', 'peld', 'running', 'skrie', 'marathon', 'maraton', 'skiing', 'slēpo', 'cycling', 'bicycl',
    'riteņbrauc', 'gym', 'training', 'treniņ', 'danc', 'dejo', 'deju',
  ],
  nature: ['forest', 'hike', 'hiking', 'pārgājien', 'sēņo', 'sēnes', 'mushroom', 'berries', 'ogot', 'nature', 'camping', 'kempin', 'telt'],
  fishing: ['fish', 'makšķer', 'zvej', 'copē'],
  travel: ['travel', 'ceļo', 'holiday', 'vacation', 'atvaļinājum', 'flight', 'lidojum', 'abroad', 'ārzemē'],
  photography: ['photographing', 'photographer', 'photography', 'fotografē', 'camera', 'kamera'],
  crafts: ['knit', 'adīj', 'adīt', 'adīšan', 'sewing', 'šūt', 'šuva', 'šūšan', 'craft', 'rokdarb', 'crochet', 'tamborē', 'pottery', 'keramik', 'podniec'],
  drawing: ['draw', 'zīmē', 'paint', 'glezn', 'māksl', 'artist'],
  games: ['game', 'spēl', 'puzzle', 'puzl', 'chess', 'šah'],
  tech: ['computer', 'dator', 'robot', 'programming', 'coding', 'drone', 'dron', 'gadget'],
  animals: ['dog', 'suņ', 'kaķ', 'kitten', 'horse', 'zirg', 'pony', 'ponij', 'zoodārz', 'rabbit', 'trusī', 'truš', 'bird', 'putn', 'hamster', 'kāmj', 'mājdzīvniek'],
  films: ['movie', 'cinema', 'kino', 'theatre', 'theater', 'teātr'],
  coffee: ['coffee', 'kafij', 'café', 'cafe', 'kafejnīc'],
  wellness: ['yoga', 'joga', 'massage', 'masāž', 'pirt', 'sauna', 'meditat', 'meditāc', 'pilates'],
  diy: ['repair', 'remont', 'workshop', 'darbnīc', 'meistaro', 'renovat', 'salaboj'],
  building: ['lego', 'build', 'būvē', 'blocks', 'kluc', 'kluč', 'constructor', 'konstruktor'],
};

/**
 * Whole words only, where a beginning would catch too much: "cat" in
 * "category", "spa" in "space", "trip" in "triple", "jogu" in "jogurts".
 */
const WHOLE_WORDS: Partial<Record<InterestKey, readonly string[]>> = {
  garden: ['raža', 'ražu'],
  baking: ['maize', 'maizi'],
  reading: ['read'],
  music: ['sing', 'sings', 'sang', 'koris', 'korī', 'kora'],
  sport: ['ski'],
  nature: ['mežs', 'mežā', 'mežu', 'daba', 'dabā', 'ogās'],
  travel: ['trip', 'trips'],
  drawing: ['art'],
  crafts: ['sew', 'sewed', 'sews'],
  animals: ['cat', 'cats', 'pet', 'pets', 'suns', 'suni', 'trusis', 'zoo'],
  films: ['film', 'films'],
  coffee: ['tea', 'tēja', 'tēju'],
  wellness: ['spa', 'jogu'],
  diy: ['diy'],
};

/**
 * How many entries have to mention something before it counts as something
 * the person likes. One beach weekend with a dog does not make a dog person.
 */
const MIN_MENTIONS = 2;

/**
 * The words of an entry, lower case. Letters are Latin with the accents
 * Latvian needs (U+00C0-U+024F): "ģitāra" stays one word.
 */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u00c0-\u024f]+/)
    .filter(Boolean);
}

function mentions(entryWords: readonly string[], interest: InterestKey): boolean {
  const whole = WHOLE_WORDS[interest] ?? [];
  const stems = STEMS[interest];
  return entryWords.some((word) => whole.includes(word) || stems.some((stem) => word.startsWith(stem)));
}

/**
 * What the family's entries about this person keep coming back to: the
 * events they are IN (not the ones they wrote - a mother who posts her son's
 * swimming practice has not taken up swimming), mentioned in at least
 * MIN_MENTIONS of them, most first. A trip filed as travel counts as travel
 * whatever it says.
 *
 * A sealed time capsule is an envelope with no words, and adds nothing.
 */
export function interestsFromEntries(memberId: string, events: readonly FamilyEvent[]): InterestKey[] {
  const counts = new Map<InterestKey, number>();

  for (const event of events) {
    if (event.sealed || !event.participantMemberIds.includes(memberId)) continue;
    const entryWords = words([event.title, ...(event.tags ?? [])].join(' '));

    for (const interest of INTEREST_KEYS) {
      const filed = interest === 'travel' && event.categoryId === 'travel';
      if (filed || mentions(entryWords, interest)) counts.set(interest, (counts.get(interest) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, n]) => n >= MIN_MENTIONS)
    .sort((a, b) => b[1] - a[1] || INTEREST_KEYS.indexOf(a[0]) - INTEREST_KEYS.indexOf(b[0]))
    .map(([interest]) => interest);
}

/** Whole years on `now`. */
function ageOn(birthDate: string, now: Date): number {
  const born = toDate(birthDate);
  let age = now.getFullYear() - born.getFullYear();
  const beforeBirthday =
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** A child's stage, for the ideas that follow age rather than taste. Null for an adult or an unknown birthday. */
export function ageBand(birthDate: string | undefined, now: Date = new Date()): AgeBand | null {
  if (!birthDate) return null;
  const age = ageOn(birthDate, now);
  if (age < 0) return null;
  if (age < 2) return 'baby';
  if (age < 6) return 'toddler';
  if (age < 13) return 'child';
  if (age < 18) return 'teen';
  return null;
}

/** The idea in the reader's language. Called at render, never at import. */
export function giftIdeaText(idea: GiftIdea): string {
  return t(idea.key);
}

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The ideas for one person, as one viewer sees them.
 *
 * Nobody gets ideas for themselves - the family is who buys. Everything the
 * person chose comes first, one idea each before anybody's second, so a list
 * of six reads as six different things; then what the entries suggest; then,
 * for a child, their age; and never fewer than three, with ideas that suit
 * anybody at the end. An idea somebody already took is on the wish list now,
 * as a line with the same words, and is not offered twice.
 */
export function giftIdeasFor(input: {
  member: Member;
  viewerId: string | undefined;
  events?: readonly FamilyEvent[];
  wishes?: readonly Wish[];
  now?: Date;
  limit?: number;
}): GiftIdea[] {
  const { member, viewerId } = input;
  if (!viewerId || viewerId === member.id) return [];

  const limit = input.limit ?? MAX_GIFT_IDEAS;
  const taken = new Set((input.wishes ?? []).map((w) => normalise(w.text)));
  const ideas: GiftIdea[] = [];

  function offer(idea: GiftIdea): void {
    if (ideas.length >= limit) return;
    if (ideas.some((i) => i.key === idea.key)) return;
    if (taken.has(normalise(giftIdeaText(idea)))) return;
    ideas.push(idea);
  }

  const chosen = cleanInterests(member.interests);
  const inferred = interestsFromEntries(member.id, input.events ?? []).filter((k) => !chosen.includes(k));
  const sources: { interest: InterestKey; source: GiftSource }[] = [
    ...chosen.map((interest) => ({ interest, source: 'interest' as const })),
    ...inferred.map((interest) => ({ interest, source: 'family' as const })),
  ];

  for (const n of NUMBERS) {
    for (const { interest, source } of sources) offer({ key: `gift.idea.${interest}.${n}`, source, interest });
  }

  const band = ageBand(member.birthDate, input.now ?? new Date());
  if (band) for (const n of NUMBERS) offer({ key: `gift.age.${band}.${n}`, source: 'age' });

  for (const n of NUMBERS) {
    if (ideas.length >= 3) break;
    offer({ key: `gift.general.${n}`, source: 'general' });
  }

  return ideas;
}

/**
 * Where "Search" goes: a web search for the idea's words and nothing else -
 * never a name, never who it is for. The search is the reader's own, in
 * their own browser.
 */
export function giftSearchUrl(text: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}
