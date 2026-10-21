/**
 * Mock family, so the app runs with no backend.
 *
 * These are NOT random. Every edge case the design and the product need to see
 * is here on purpose, visible the moment you open the app:
 *
 *   - an event with one photo and one with several
 *   - an event with no photo at all (text only)
 *   - an event only the parents can see (the privacy demonstration)
 *   - an event visible to exactly one person
 *   - a milestone next to an ordinary day
 *   - a long title that wraps to two lines
 *   - an event in the future and one in the past
 *   - two events on the same day (calendar density)
 *   - a schedule conflict (for the conflict detector)
 *
 * Once a design works against this data, it has already met the real edge cases.
 *
 * Mirrored by apps/api/prisma/seed.ts — if the app looks different against the
 * API than it does here, that difference is a bug, not data.
 */

import { localDay } from '@/domain/recurrence';
import { SPECIAL_DAYS, nextSpecialDay } from '@/domain/special-days';
import type {
  AppNotification,
  Comment,
  Family,
  FamilyEvent,
  Group,
  Invitation,
  Member,
  Session,
  User,
  Wish,
} from '@/domain/types';

const FAMILY_ID = 'fam_bergs';

/** Dates are relative to today so the mock never goes stale. */
function daysFromNow(days: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * A birthday: the same day of the year, `yearsAgo` back, landing `inDays` from
 * today.
 *
 * The strip on the timeline has nothing to show unless somebody's birthday is
 * actually near, and a fixed date would put the family inside the window for
 * one month a year and leave the feature invisible for the other eleven.
 */
function birthdayIn(yearsAgo: number, inDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + inDays);
  d.setFullYear(d.getFullYear() - yearsAgo);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

/**
 * The same calendar day, a whole number of years back.
 *
 * "On this day" has no state to show unless the mock actually contains one, and
 * an anniversary is a moving target — hardcoding a date would make the strip
 * appear on exactly one day of the year and look broken on every other.
 */
function yearsAgoToday(years: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** A day of the year `yearsAgo` back (month from 1), at an hour - for what repeats every year. */
function onDate(yearsAgo: number, month: number, day: number, hour = 12): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - yearsAgo, month - 1, day);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/**
 * The sample family's recorded voice: a short music-box lullaby made for the
 * demo (public/sounds/lullaby.wav, served beside the web app). The sample
 * family is a web demo; on a phone the player says it cannot play it.
 */
const LULLABY = '/sounds/lullaby.wav';

function lullabyNote(id: string) {
  return { id, kind: 'audio' as const, url: LULLABY, durationSec: 9 };
}

// ---------------------------------------------------------------------------
// Family
// ---------------------------------------------------------------------------

export const mockFamily: Family = {
  id: FAMILY_ID,
  name: 'The Bergs',
  createdAt: daysFromNow(-420),
  plan: 'free',
  locale: 'en',
};

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export const M = {
  anna: 'mem_anna',
  martin: 'mem_martin',
  emily: 'mem_emily',
  robert: 'mem_robert',
  vera: 'mem_vera',
} as const;

export const G = {
  parents: 'grp_parents',
  children: 'grp_children',
  grandparents: 'grp_grandparents',
} as const;

export const mockMembers: Member[] = [
  {
    id: M.anna,
    familyId: FAMILY_ID,
    userId: 'usr_anna',
    displayName: 'Anna',
    role: 'admin',
    status: 'active',
    birthDate: birthdayIn(36, 84),
    interests: ['photography', 'reading', 'wellness', 'coffee'],
    groupIds: [G.parents],
    joinedAt: daysFromNow(-420),
  },
  {
    id: M.martin,
    familyId: FAMILY_ID,
    userId: 'usr_martin',
    displayName: 'Martin',
    role: 'member',
    status: 'active',
    birthDate: birthdayIn(39, 19),
    interests: ['fishing', 'diy', 'sport', 'tech'],
    groupIds: [G.parents],
    joinedAt: daysFromNow(-418),
  },
  {
    id: M.emily,
    familyId: FAMILY_ID,
    userId: null,
    displayName: 'Emily',
    role: 'child',
    status: 'active',
    managedByMemberId: M.anna,
    birthDate: daysFromNow(-2570),
    // Set by Anna, who manages the profile.
    interests: ['drawing', 'animals', 'crafts'],
    groupIds: [G.children],
    joinedAt: daysFromNow(-418),
  },
  {
    id: M.robert,
    familyId: FAMILY_ID,
    userId: null,
    displayName: 'Robert',
    role: 'child',
    status: 'active',
    managedByMemberId: M.anna,
    birthDate: daysFromNow(-1180),
    interests: ['building', 'animals'],
    groupIds: [G.children],
    joinedAt: daysFromNow(-418),
  },
  {
    id: M.vera,
    familyId: FAMILY_ID,
    userId: 'usr_vera',
    displayName: 'Vera',
    role: 'viewer',
    status: 'active',
    birthDate: birthdayIn(68, 5),
    // Five days to her birthday: hers are the gift ideas the demo leads to.
    interests: ['garden', 'baking', 'reading', 'music'],
    groupIds: [G.grandparents],
    joinedAt: daysFromNow(-300),
  },
  // James, invited as a viewer, is not here: somebody who has not accepted is
  // an invitation (mockInvitations), not a member - the server's model too.
  // As both, he was listed twice under "Pending invitations" (item 28).
];

export const mockGroups: Group[] = [
  {
    id: G.parents,
    familyId: FAMILY_ID,
    name: 'Parents',
    isSystem: true,
    icon: 'parents',
    memberIds: [M.anna, M.martin],
  },
  {
    id: G.children,
    familyId: FAMILY_ID,
    name: 'Children',
    isSystem: true,
    icon: 'children',
    memberIds: [M.emily, M.robert],
  },
  {
    id: G.grandparents,
    familyId: FAMILY_ID,
    name: 'Grandparents',
    isSystem: true,
    icon: 'grandparents',
    memberIds: [M.vera],
  },
];

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function img(seed: string, w = 1200, h = 800) {
  // Placeholder images. Design should replace these with real family photos
  // (with permission) or good stock.
  //
  // The thumbnail keeps the full image's ratio. A thumbnail of a fixed shape
  // would be cropped a second time inside a layout that already reserved the
  // right space for the photograph — and the mock would then be lying about
  // what a real upload does.
  return {
    id: `att_${seed}`,
    kind: 'image' as const,
    url: `https://picsum.photos/seed/${seed}/${w}/${h}`,
    thumbnailUrl: `https://picsum.photos/seed/${seed}/400/${Math.round((400 * h) / w)}`,
    width: w,
    height: h,
  };
}

export const mockEvents: FamilyEvent[] = [
  // --- Past: a milestone with several photos ---
  {
    id: 'evt_school',
    familyId: FAMILY_ID,
    title: "Emily's first day of school",
    tags: ['School', 'First day'],
    description:
      'She wanted to walk in alone, then looked back at the door anyway. Her teacher said the class is small — 18 children.',
    startsAt: daysFromNow(-21, 8, 30),
    allDay: false,
    categoryId: 'education',
    participantMemberIds: [M.emily, M.anna, M.martin],
    authorMemberId: M.anna,
    visibility: { kind: 'family' },
    // Three shapes on purpose: landscape, portrait, square. The strip on the
    // opened event has to hold all three without cropping any of them.
    attachments: [img('school1'), img('school2', 800, 1200), img('school3', 1000, 1000)],
    reactions: [
      { memberId: M.martin, kind: 'heart' },
      { memberId: M.vera, kind: 'heart' },
    ],
    commentCount: 3,
    createdAt: daysFromNow(-21),
    updatedAt: daysFromNow(-21),
    isMilestone: true,
  },

  // --- Past: text only, no photo ---
  {
    id: 'evt_word',
    familyId: FAMILY_ID,
    title: 'Robert said "tractor"',
    tags: ['First words'],
    description: 'Perfectly clear. Three times in a row, and then never again.',
    startsAt: daysFromNow(-9, 18, 15),
    allDay: false,
    categoryId: 'development',
    participantMemberIds: [M.robert],
    authorMemberId: M.martin,
    visibility: { kind: 'family' },
    attachments: [],
    reactions: [{ memberId: M.anna, kind: 'smile' }],
    commentCount: 1,
    createdAt: daysFromNow(-9),
    updatedAt: daysFromNow(-9),
    isMilestone: true,
  },

  // --- Past: parents only — the privacy demonstration ---
  {
    id: 'evt_private',
    familyId: FAMILY_ID,
    title: 'Meeting with the school counsellor',
    description: 'Next appointment in a month. Nothing serious, but worth keeping an eye on.',
    startsAt: daysFromNow(-5, 15, 0),
    allDay: false,
    categoryId: 'health',
    participantMemberIds: [M.emily, M.anna],
    authorMemberId: M.anna,
    visibility: { kind: 'groups', groupIds: [G.parents] },
    attachments: [],
    reactions: [],
    commentCount: 2,
    createdAt: daysFromNow(-5),
    updatedAt: daysFromNow(-5),
    isMilestone: false,
  },

  // --- Past: one photo, long title ---
  {
    id: 'evt_beach',
    familyId: FAMILY_ID,
    title: 'A weekend at the coast with the whole crowd and two dogs',
    tags: ['Holiday'],
    description: 'The water was freezing. Robert went in anyway.',
    startsAt: daysFromNow(-40, 11, 0),
    endsAt: daysFromNow(-38, 17, 0),
    allDay: true,
    categoryId: 'travel',
    participantMemberIds: [M.anna, M.martin, M.emily, M.robert, M.vera],
    authorMemberId: M.martin,
    visibility: { kind: 'family' },
    // A panorama — wider than 16:9, so the card's cap is what stops it
    // becoming a letterbox strip.
    attachments: [img('beach1', 1600, 700)],
    reactions: [
      { memberId: M.anna, kind: 'heart' },
      { memberId: M.vera, kind: 'clap' },
      { memberId: M.emily, kind: 'wow' },
    ],
    commentCount: 5,
    createdAt: daysFromNow(-38),
    updatedAt: daysFromNow(-38),
    isMilestone: false,
  },

  // --- Past: visible to the author only ---
  {
    id: 'evt_gift',
    familyId: FAMILY_ID,
    title: 'Gift idea for Martin',
    description: 'That bike rack thing he kept talking about in March.',
    startsAt: daysFromNow(-2, 21, 0),
    allDay: false,
    categoryId: 'other',
    participantMemberIds: [],
    authorMemberId: M.anna,
    visibility: { kind: 'private' },
    attachments: [],
    reactions: [],
    commentCount: 0,
    createdAt: daysFromNow(-2),
    updatedAt: daysFromNow(-2),
    isMilestone: false,
  },

  // --- Today ---
  {
    id: 'evt_dentist',
    familyId: FAMILY_ID,
    title: 'Dentist — Emily',
    startsAt: daysFromNow(0, 16, 0),
    allDay: false,
    categoryId: 'health',
    participantMemberIds: [M.emily, M.martin],
    authorMemberId: M.anna,
    visibility: { kind: 'groups', groupIds: [G.parents] },
    attachments: [],
    reactions: [],
    commentCount: 0,
    reminder: { id: 'rem_1', eventId: 'evt_dentist', minutesBefore: 60, enabled: true },
    createdAt: daysFromNow(-6),
    updatedAt: daysFromNow(-6),
    isMilestone: false,
  },

  // --- Today, second event: calendar density + a conflict ---
  // Also the repeating series (domain/recurrence.ts): one event, every week,
  // begun three weeks ago - so the calendar has it on every page, the
  // timeline shows it once at today's practice, and last week's was skipped.
  {
    id: 'evt_training',
    familyId: FAMILY_ID,
    title: 'Swimming practice',
    description: 'Bring the goggles. Martin collects.',
    startsAt: daysFromNow(-21, 16, 30),
    endsAt: daysFromNow(-21, 17, 30),
    allDay: false,
    categoryId: 'activity',
    participantMemberIds: [M.emily],
    authorMemberId: M.martin,
    visibility: { kind: 'family' },
    attachments: [],
    reactions: [],
    commentCount: 0,
    createdAt: daysFromNow(-30),
    updatedAt: daysFromNow(-30),
    isMilestone: false,
    repeat: 'weekly',
    // Last week's, as the local day - the same day the calendar draws it on.
    repeatSkips: [localDay(daysFromNow(-7, 16, 30))],
  },

  // --- Future: birthday with a reminder ---
  {
    id: 'evt_birthday',
    familyId: FAMILY_ID,
    title: "Robert's 3rd birthday",
    tags: ['Birthday'],
    description: 'Cake with a digger on it. Not a tractor — he corrected us himself.',
    startsAt: daysFromNow(6, 12, 0),
    allDay: true,
    categoryId: 'celebration',
    participantMemberIds: [M.robert, M.anna, M.martin, M.emily, M.vera],
    authorMemberId: M.anna,
    visibility: { kind: 'family' },
    attachments: [img('cake1')],
    reactions: [
      { memberId: M.vera, kind: 'heart' },
      { memberId: M.martin, kind: 'clap' },
    ],
    commentCount: 4,
    reminder: { id: 'rem_2', eventId: 'evt_birthday', minutesBefore: 1440, enabled: true },
    createdAt: daysFromNow(-14),
    updatedAt: daysFromNow(-3),
    isMilestone: true,
  },

  // --- Future: parents and grandparents only ---
  {
    id: 'evt_concert',
    familyId: FAMILY_ID,
    title: "Emily's school concert",
    tags: ['School'],
    description: 'In the main hall, entrance from the courtyard side.',
    startsAt: daysFromNow(12, 18, 0),
    allDay: false,
    categoryId: 'education',
    participantMemberIds: [M.emily],
    authorMemberId: M.anna,
    visibility: { kind: 'groups', groupIds: [G.parents, G.grandparents] },
    attachments: [],
    reactions: [{ memberId: M.vera, kind: 'heart' }],
    commentCount: 1,
    reminder: { id: 'rem_3', eventId: 'evt_concert', minutesBefore: 1440, enabled: true },
    createdAt: daysFromNow(-8),
    updatedAt: daysFromNow(-8),
    isMilestone: false,
  },

  // --- Future: a chore ---
  {
    id: 'evt_car',
    familyId: FAMILY_ID,
    title: 'Car inspection',
    startsAt: daysFromNow(19, 9, 0),
    allDay: false,
    categoryId: 'chore',
    participantMemberIds: [M.martin],
    authorMemberId: M.martin,
    visibility: { kind: 'groups', groupIds: [G.parents] },
    attachments: [],
    reactions: [],
    commentCount: 0,
    reminder: { id: 'rem_4', eventId: 'evt_car', minutesBefore: 10080, enabled: true },
    createdAt: daysFromNow(-1),
    updatedAt: daysFromNow(-1),
    isMilestone: false,
  },

  // --- Deep past: an archive entry ---
  {
    id: 'evt_steps',
    familyId: FAMILY_ID,
    title: "Robert's first steps",
    tags: ['First steps'],
    description: 'Sofa to table. Four steps, then straight down.',
    startsAt: daysFromNow(-800, 19, 0),
    allDay: false,
    categoryId: 'development',
    participantMemberIds: [M.robert],
    authorMemberId: M.anna,
    visibility: { kind: 'family' },
    // A portrait cover: square in the timeline, its own 4:5 once opened.
    attachments: [img('steps1', 800, 1200), img('steps2')],
    reactions: [
      { memberId: M.martin, kind: 'heart' },
      { memberId: M.vera, kind: 'heart' },
    ],
    commentCount: 7,
    createdAt: daysFromNow(-800),
    updatedAt: daysFromNow(-800),
    isMilestone: true,
  },

  // --- Exactly one year ago today: the "On this day" state ---
  {
    id: 'evt_anniversary',
    familyId: FAMILY_ID,
    title: 'The tree in the garden',
    description: 'Planted the apple tree. Robert helped, mostly by standing in the hole.',
    startsAt: yearsAgoToday(1, 16, 0),
    allDay: false,
    categoryId: 'activity',
    participantMemberIds: [M.robert, M.martin],
    authorMemberId: M.martin,
    visibility: { kind: 'family' },
    attachments: [img('tree1')],
    reactions: [{ memberId: M.anna, kind: 'heart' }],
    commentCount: 0,
    createdAt: yearsAgoToday(1),
    updatedAt: yearsAgoToday(1),
    isMilestone: false,
  },

  // --- Two years ago today: proves the strip handles more than one ---
  {
    id: 'evt_anniversary2',
    familyId: FAMILY_ID,
    title: "Emily's first swimming lesson",
    startsAt: yearsAgoToday(2, 17, 30),
    allDay: false,
    categoryId: 'activity',
    participantMemberIds: [M.emily],
    authorMemberId: M.anna,
    visibility: { kind: 'family' },
    attachments: [],
    reactions: [],
    commentCount: 0,
    createdAt: yearsAgoToday(2),
    updatedAt: yearsAgoToday(2),
    isMilestone: false,
  },
  // --- Keepsakes (docs/07-IMPROVEMENTS.md items 75-82) ---

  // A wish for Vera's birthday in five days, kept from her until that
  // morning (domain/surprises.ts). Anna, looking, is asked to add hers.
  {
    id: 'evt_wish_martin',
    familyId: FAMILY_ID,
    title: 'Happy birthday, Vera!',
    description:
      'Sixty-eight and still the fastest pancake-maker on the street. Thank you for every Sunday.',
    startsAt: daysFromNow(5, 7, 0),
    allDay: false,
    categoryId: 'celebration',
    participantMemberIds: [M.vera],
    authorMemberId: M.martin,
    visibility: { kind: 'family' },
    attachments: [img('wish-vera')],
    reactions: [],
    commentCount: 0,
    createdAt: daysFromNow(-1, 21),
    updatedAt: daysFromNow(-1, 21),
    isMilestone: false,
    hiddenFromMemberId: M.vera,
    revealAt: daysFromNow(5, 7, 0),
  },

  // A time capsule Martin sealed for Robert's eighteenth birthday: to Anna it
  // is an envelope (domain/capsules.ts).
  {
    id: 'evt_capsule_robert',
    familyId: FAMILY_ID,
    title: 'For Robert, at eighteen',
    description: 'What we hoped for you when you were three, and what you were like.',
    startsAt: daysFromNow(-30, 20),
    allDay: false,
    categoryId: 'milestone',
    participantMemberIds: [M.robert],
    authorMemberId: M.martin,
    visibility: { kind: 'groups', groupIds: [G.parents] },
    attachments: [],
    reactions: [],
    commentCount: 0,
    createdAt: daysFromNow(-30, 20),
    updatedAt: daysFromNow(-30, 20),
    isMilestone: true,
    sealedUntil: daysFromNow(-1180 + Math.round(18 * 365.25), 9),
  },

  // And one Anna sealed herself, which she can still read.
  {
    id: 'evt_capsule_emily',
    familyId: FAMILY_ID,
    title: 'A letter to Emily, for when she is ten',
    description:
      'You are seven, and today you told me the moon follows our car. Keep noticing things like that.',
    startsAt: daysFromNow(-12, 21),
    allDay: false,
    categoryId: 'milestone',
    participantMemberIds: [M.emily],
    authorMemberId: M.anna,
    visibility: { kind: 'groups', groupIds: [G.parents] },
    attachments: [],
    reactions: [],
    commentCount: 0,
    createdAt: daysFromNow(-12, 21),
    updatedAt: daysFromNow(-12, 21),
    isMilestone: false,
    sealedUntil: daysFromNow(3 * 365 + 40, 9),
  },

  // On the story shelf: a grandmother's tale, recorded on Anna's phone, and a
  // father's goodnight song.
  {
    id: 'evt_tale_bear',
    familyId: FAMILY_ID,
    title: 'The bear who could not sleep',
    description: 'Vera told it at Easter, and Robert has asked for it every night since.',
    startsAt: daysFromNow(-160, 19, 30),
    allDay: false,
    categoryId: 'other',
    participantMemberIds: [M.vera],
    authorMemberId: M.anna,
    visibility: { kind: 'family' },
    attachments: [],
    voiceNotes: [lullabyNote('voice_bear')],
    reactions: [{ memberId: M.martin, kind: 'heart' }],
    commentCount: 0,
    createdAt: daysFromNow(-160, 19, 30),
    updatedAt: daysFromNow(-160, 19, 30),
    isMilestone: false,
    onStoryShelf: true,
  },
  {
    id: 'evt_tale_song',
    familyId: FAMILY_ID,
    title: "Martin's goodnight song",
    startsAt: daysFromNow(-40, 20, 15),
    allDay: false,
    categoryId: 'other',
    participantMemberIds: [],
    authorMemberId: M.martin,
    visibility: { kind: 'family' },
    attachments: [],
    voiceNotes: [lullabyNote('voice_song')],
    reactions: [],
    commentCount: 0,
    createdAt: daysFromNow(-40, 20, 15),
    updatedAt: daysFromNow(-40, 20, 15),
    isMilestone: false,
    onStoryShelf: true,
  },

  // Vera's life story, three questions in (domain/lifestory.ts): Anna asked,
  // Vera told, Anna wrote it down.
  {
    id: 'evt_ls_born',
    familyId: FAMILY_ID,
    title: 'Where and when were you born, and what do you know about that day?',
    description: 'In Cēsis, in a snowstorm. My father walked four kilometres for the midwife and came back without his hat.',
    startsAt: daysFromNow(-70, 17),
    allDay: false,
    categoryId: 'other',
    participantMemberIds: [M.vera],
    authorMemberId: M.anna,
    visibility: { kind: 'family' },
    attachments: [],
    reactions: [{ memberId: M.martin, kind: 'heart' }],
    commentCount: 0,
    createdAt: daysFromNow(-70, 17),
    updatedAt: daysFromNow(-70, 17),
    isMilestone: false,
    promptKey: 'ls-born',
  },
  {
    id: 'evt_ls_home',
    familyId: FAMILY_ID,
    title: 'Describe the home you grew up in.',
    description: 'A wooden house with the stove in the middle, so every room was warm on one side.',
    startsAt: daysFromNow(-55, 17),
    allDay: false,
    categoryId: 'other',
    participantMemberIds: [M.vera],
    authorMemberId: M.anna,
    visibility: { kind: 'family' },
    attachments: [],
    reactions: [],
    commentCount: 0,
    createdAt: daysFromNow(-55, 17),
    updatedAt: daysFromNow(-55, 17),
    isMilestone: false,
    promptKey: 'ls-home',
  },
  {
    id: 'evt_ls_met',
    familyId: FAMILY_ID,
    title: 'How did you meet the love of your life?',
    description: 'At a dance in 1978. He stepped on my foot twice and apologised in rhyme.',
    startsAt: daysFromNow(-20, 17),
    allDay: false,
    categoryId: 'other',
    participantMemberIds: [M.vera],
    authorMemberId: M.anna,
    visibility: { kind: 'family' },
    attachments: [],
    reactions: [{ memberId: M.emily, kind: 'smile' }],
    commentCount: 0,
    createdAt: daysFromNow(-20, 17),
    updatedAt: daysFromNow(-20, 17),
    isMilestone: false,
    promptKey: 'ls-met',
  },

  // What repeats (domain/yearly.ts): Midsummer three years running, and the
  // first day at kindergarten last year before this year's first day of school.
  ...[2, 1, 0].map((yearsAgo) => ({
    id: `evt_midsummer_${yearsAgo}`,
    familyId: FAMILY_ID,
    title: 'Midsummer at the lake',
    tags: ['Midsummer'],
    startsAt: onDate(yearsAgo, 6, 23, 19),
    allDay: false,
    categoryId: 'celebration' as const,
    participantMemberIds: [M.anna, M.martin, M.emily, M.robert],
    authorMemberId: M.anna,
    visibility: { kind: 'family' as const },
    attachments: [img(`midsummer${yearsAgo}`)],
    reactions: [],
    commentCount: 0,
    createdAt: onDate(yearsAgo, 6, 24, 9),
    updatedAt: onDate(yearsAgo, 6, 24, 9),
    isMilestone: false,
  })),
  {
    id: 'evt_kindergarten',
    familyId: FAMILY_ID,
    title: "Emily's first day at kindergarten",
    tags: ['First day'],
    startsAt: onDate(1, 9, 1, 8),
    allDay: false,
    categoryId: 'education',
    participantMemberIds: [M.emily],
    authorMemberId: M.martin,
    visibility: { kind: 'groups', groupIds: [G.parents] },
    attachments: [img('kindergarten', 800, 1100)],
    reactions: [{ memberId: M.anna, kind: 'heart' }],
    commentCount: 0,
    createdAt: onDate(1, 9, 1, 12),
    updatedAt: onDate(1, 9, 1, 12),
    isMilestone: true,
  },
];

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export const mockComments: Comment[] = [
  {
    id: 'cmt_1',
    eventId: 'evt_school',
    authorMemberId: M.vera,
    body: 'Look how grown up she is. Thank you for sending the photos!',
    createdAt: daysFromNow(-21, 19, 30),
  },
  {
    id: 'cmt_2',
    eventId: 'evt_school',
    authorMemberId: M.martin,
    body: 'The middle one is the best photo.',
    createdAt: daysFromNow(-20, 8, 10),
  },
  {
    id: 'cmt_3',
    eventId: 'evt_school',
    authorMemberId: M.anna,
    body: 'We should print this one for the album.',
    createdAt: daysFromNow(-20, 21, 45),
  },
  {
    id: 'cmt_4',
    eventId: 'evt_birthday',
    authorMemberId: M.vera,
    body: "I'll bring the cake. What colour should it be?",
    createdAt: daysFromNow(-3, 12, 0),
  },
  {
    id: 'cmt_5',
    eventId: 'evt_word',
    authorMemberId: M.anna,
    body: "And he hasn't said anything else since.",
    createdAt: daysFromNow(-9, 20, 0),
  },
];

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export const mockInvitations: Invitation[] = [
  {
    id: 'inv_1',
    familyId: FAMILY_ID,
    email: 'james.hale@example.com',
    code: 'FAM-J4K7',
    role: 'viewer',
    groupIds: [G.grandparents],
    invitedByMemberId: M.anna,
    expiresAt: daysFromNow(10),
  },
];

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Wish lists
//
// Vera's birthday is five days away, so hers is the list the demo leads to:
// two lines of her own, an idea from Martin she will never see, and a claim.
// Anna (the signed-in member) has one line of her own and one idea from
// Martin - which the app must NOT show her (domain/wishes.ts).
// ---------------------------------------------------------------------------

export const mockWishes: Record<string, Wish[]> = {
  [M.vera]: [
    {
      id: 'wish_album',
      text: 'A photo album for the grandchildren’s pictures',
      addedByMemberId: M.vera,
      claimedByMemberId: M.martin,
      createdAt: daysFromNow(-40),
    },
    {
      id: 'wish_seeds',
      text: 'Lavender seeds for the balcony',
      addedByMemberId: M.vera,
      claimedByMemberId: null,
      createdAt: daysFromNow(-30),
    },
    {
      id: 'wish_theatre',
      text: 'Theatre tickets — she mentioned the new play twice',
      addedByMemberId: M.martin,
      claimedByMemberId: null,
      createdAt: daysFromNow(-12),
    },
  ],
  [M.anna]: [
    {
      id: 'wish_pen',
      text: 'A good fountain pen',
      addedByMemberId: M.anna,
      claimedByMemberId: null,
      createdAt: daysFromNow(-20),
    },
    {
      id: 'wish_spa',
      text: 'A spa weekend, just the two of us',
      addedByMemberId: M.martin,
      claimedByMemberId: M.martin,
      createdAt: daysFromNow(-8),
    },
  ],
};

const NEXT_SPECIAL_DAY = SPECIAL_DAYS.map(({ key }) => nextSpecialDay(key)).sort(
  (a, b) => a.inDays - b.inDays,
)[0];

export const mockNotifications: AppNotification[] = [
  {
    id: 'ntf_1',
    kind: 'event_reminder',
    title: "Tomorrow: Robert's 3rd birthday",
    body: "Don't forget the cake with the digger.",
    eventId: 'evt_birthday',
    createdAt: daysFromNow(0, 9, 0),
  },
  {
    id: 'ntf_2',
    kind: 'comment_added',
    title: 'Vera commented',
    body: '"I\'ll bring the cake. What colour should it be?"',
    eventId: 'evt_birthday',
    actorMemberId: M.vera,
    createdAt: daysFromNow(-3, 12, 0),
    readAt: daysFromNow(-3, 14, 0),
  },
  {
    id: 'ntf_3',
    kind: 'conflict_detected',
    title: 'Two events overlap',
    body: 'Emily has the dentist at 16:00 and practice at 16:30.',
    eventId: 'evt_training',
    createdAt: daysFromNow(0, 8, 0),
  },
  {
    // The family's next special day, as the server announces one - facts,
    // no text, so it is put into words in whichever language is chosen, and
    // computed, so the demo never announces last month's.
    id: 'ntf_4',
    kind: 'special_day',
    dayKey: NEXT_SPECIAL_DAY.key,
    dayOn: NEXT_SPECIAL_DAY.day.toISOString(),
    createdAt: daysFromNow(0, 9, 0),
  },
];

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export const mockUser: User = {
  id: 'usr_anna',
  email: 'anna.berg@example.com',
  displayName: 'Anna',
  locale: 'en',
  createdAt: daysFromNow(-420),
};

export const mockSession: Session = {
  user: mockUser,
  activeFamilyId: FAMILY_ID,
  activeMemberId: M.anna,
};
