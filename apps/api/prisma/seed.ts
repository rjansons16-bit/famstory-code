/**
 * Seed data: the Berg family.
 *
 * The same data as the mobile app's mock layer (apps/mobile/src/data/mock.ts) —
 * deliberately, so the same situations can be compared with and without a
 * backend. If the app connects to the API and a screen looks different from the
 * mock version, that difference is a bug, not data.
 *
 * Every edge case is here on purpose:
 *   - an event visible to Parents only (a child's health data)
 *   - an event visible only to its author
 *   - an event visible to two groups
 *   - two events on one day for one member (a schedule conflict)
 *   - an invitation that has not been accepted
 *
 * Run:  npm --prefix apps/api run prisma:seed
 */

import {
  AuthProvider,
  MemberRole,
  MemberStatus,
  PrismaClient,
  ReactionKind,
  VisibilityKind,
} from '@prisma/client';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const prisma = new PrismaClient();
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** The same format as PasswordService — the seed must not bypass the password scheme. */
async function hashPassword(password: string): Promise<string> {
  const N = 2 ** 17;
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64, {
    N,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  });
  return ['scrypt', N, 8, 1, salt.toString('base64'), derived.toString('base64')].join('$');
}

function daysFromNow(days: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * A birthday: the same day of the year, `yearsAgo` back, landing `inDays` from
 * today. Mirrors the helper in apps/mobile/src/data/mock.ts, and for the same
 * reason - the app only shows a birthday that is actually near, so a fixed
 * date would leave the feature invisible for eleven months of the year.
 */
function birthdayIn(yearsAgo: number, inDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + inDays);
  d.setFullYear(d.getFullYear() - yearsAgo);
  d.setHours(12, 0, 0, 0);
  return d;
}

const DEMO_PASSWORD = 'FamStory2026!';

async function main(): Promise<void> {
  console.log('Clearing previous seed data…');
  // Cascade handles the rest: deleting the family takes the members, groups,
  // events, comments and invitations with it.
  await prisma.family.deleteMany({ where: { name: 'The Bergs' } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@example.com' } } });

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // --- Users ---
  const [anna, martin, vera] = await Promise.all(
    [
      { email: 'anna.berg@example.com', displayName: 'Anna' },
      { email: 'martin.berg@example.com', displayName: 'Martin' },
      { email: 'vera.berg@example.com', displayName: 'Vera' },
    ].map((u) =>
      prisma.user.create({
        data: {
          ...u,
          passwordHash,
          locale: 'en',
          emailVerifiedAt: new Date(),
          identities: { create: { provider: AuthProvider.email, providerUserId: u.email } },
        },
      }),
    ),
  );

  // --- The family ---
  const family = await prisma.family.create({
    data: { name: 'The Bergs', locale: 'en', createdAt: daysFromNow(-420) },
  });

  // --- Members ---
  const mAnna = await prisma.member.create({
    data: {
      familyId: family.id,
      userId: anna.id,
      displayName: 'Anna',
      role: MemberRole.admin,
      status: MemberStatus.active,
      birthDate: birthdayIn(36, 84),
      interests: ['photography', 'reading', 'wellness', 'coffee'],
      joinedAt: daysFromNow(-420),
    },
  });
  const mMartin = await prisma.member.create({
    data: {
      familyId: family.id,
      userId: martin.id,
      displayName: 'Martin',
      role: MemberRole.member,
      status: MemberStatus.active,
      birthDate: birthdayIn(39, 19),
      interests: ['fishing', 'diy', 'sport', 'tech'],
      joinedAt: daysFromNow(-418),
    },
  });
  const mVera = await prisma.member.create({
    data: {
      familyId: family.id,
      userId: vera.id,
      displayName: 'Vera',
      role: MemberRole.viewer,
      status: MemberStatus.active,
      birthDate: birthdayIn(68, 5),
      interests: ['garden', 'baking', 'reading', 'music'],
      joinedAt: daysFromNow(-300),
    },
  });
  // Children have no account — only a record with a named manager.
  const mEmily = await prisma.member.create({
    data: {
      familyId: family.id,
      userId: null,
      displayName: 'Emily',
      role: MemberRole.child,
      status: MemberStatus.active,
      managedByMemberId: mAnna.id,
      birthDate: daysFromNow(-2570),
      interests: ['drawing', 'animals', 'crafts'],
      joinedAt: daysFromNow(-418),
    },
  });
  const mRobert = await prisma.member.create({
    data: {
      familyId: family.id,
      userId: null,
      displayName: 'Robert',
      role: MemberRole.child,
      status: MemberStatus.active,
      managedByMemberId: mAnna.id,
      birthDate: daysFromNow(-1180),
      interests: ['building', 'animals'],
      joinedAt: daysFromNow(-418),
    },
  });

  // --- System groups ---
  const gParents = await prisma.group.create({
    data: {
      familyId: family.id,
      name: 'Parents',
      icon: 'parents',
      isSystem: true,
      members: { create: [{ memberId: mAnna.id }, { memberId: mMartin.id }] },
    },
  });
  const gChildren = await prisma.group.create({
    data: {
      familyId: family.id,
      name: 'Children',
      icon: 'children',
      isSystem: true,
      members: { create: [{ memberId: mEmily.id }, { memberId: mRobert.id }] },
    },
  });
  const gGrandparents = await prisma.group.create({
    data: {
      familyId: family.id,
      name: 'Grandparents',
      icon: 'grandparents',
      isSystem: true,
      members: { create: [{ memberId: mVera.id }] },
    },
  });

  // --- Events ---
  const school = await prisma.event.create({
    data: {
      familyId: family.id,
      authorMemberId: mAnna.id,
      title: "Emily's first day of school",
      description:
        'She wanted to walk in alone, then looked back at the door anyway. Her teacher said the class is small — 18 children.',
      startsAt: daysFromNow(-21, 8, 30),
      categoryId: 'education',
      isMilestone: true,
      visibilityKind: VisibilityKind.family,
      participants: {
        create: [{ memberId: mEmily.id }, { memberId: mAnna.id }, { memberId: mMartin.id }],
      },
      reactions: {
        create: [
          { memberId: mMartin.id, kind: ReactionKind.heart },
          { memberId: mVera.id, kind: ReactionKind.heart },
        ],
      },
      comments: {
        create: [
          {
            authorMemberId: mVera.id,
            body: 'How grown up she looks. Thank you for sending the photos!',
            createdAt: daysFromNow(-21, 19, 30),
          },
          {
            authorMemberId: mMartin.id,
            body: 'The middle one is the best photo.',
            createdAt: daysFromNow(-20, 8, 10),
          },
        ],
      },
    },
  });

  // A child's health data — visible to Parents ONLY. This is the live test:
  // if Vera can see it, the visibility layer is broken.
  const counsellor = await prisma.event.create({
    data: {
      familyId: family.id,
      authorMemberId: mAnna.id,
      title: 'Meeting with the school counsellor',
      description: 'Next appointment in a month. Nothing serious, but worth keeping an eye on.',
      startsAt: daysFromNow(-5, 15, 0),
      categoryId: 'health',
      visibilityKind: VisibilityKind.groups,
      visibility: { create: [{ groupId: gParents.id }] },
      participants: { create: [{ memberId: mEmily.id }, { memberId: mAnna.id }] },
    },
  });

  // Private — only the author sees it.
  const gift = await prisma.event.create({
    data: {
      familyId: family.id,
      authorMemberId: mAnna.id,
      title: 'Gift idea for Martin',
      description: 'That bike rack thing he kept talking about in March.',
      startsAt: daysFromNow(-2, 21, 0),
      categoryId: 'other',
      visibilityKind: VisibilityKind.private,
    },
  });

  // Two groups — parents and grandparents.
  const concert = await prisma.event.create({
    data: {
      familyId: family.id,
      authorMemberId: mAnna.id,
      title: "Emily's school concert",
      description: 'In the assembly hall, entrance from the courtyard side.',
      startsAt: daysFromNow(12, 18, 0),
      categoryId: 'education',
      visibilityKind: VisibilityKind.groups,
      visibility: { create: [{ groupId: gParents.id }, { groupId: gGrandparents.id }] },
      participants: { create: [{ memberId: mEmily.id }] },
      reminders: {
        create: { minutesBefore: 1440, scheduledFor: daysFromNow(11, 18, 0) },
      },
    },
  });

  // The whole family, with a reminder.
  await prisma.event.create({
    data: {
      familyId: family.id,
      authorMemberId: mAnna.id,
      title: "Robert's 3rd birthday",
      description: 'A cake with a digger on it. Not a tractor — he corrected me himself.',
      startsAt: daysFromNow(6, 12, 0),
      allDay: true,
      categoryId: 'celebration',
      isMilestone: true,
      visibilityKind: VisibilityKind.family,
      participants: {
        create: [
          { memberId: mRobert.id },
          { memberId: mAnna.id },
          { memberId: mMartin.id },
          { memberId: mEmily.id },
          { memberId: mVera.id },
        ],
      },
      reminders: { create: { minutesBefore: 1440, scheduledFor: daysFromNow(5, 12, 0) } },
    },
  });

  // Two events, one member, overlapping times — the conflict-detection test.
  await prisma.event.create({
    data: {
      familyId: family.id,
      authorMemberId: mAnna.id,
      title: 'Dentist — Emily',
      startsAt: daysFromNow(0, 16, 0),
      endsAt: daysFromNow(0, 17, 0),
      categoryId: 'health',
      visibilityKind: VisibilityKind.groups,
      visibility: { create: [{ groupId: gParents.id }] },
      participants: { create: [{ memberId: mEmily.id }] },
    },
  });
  await prisma.event.create({
    data: {
      familyId: family.id,
      authorMemberId: mMartin.id,
      title: 'Swimming practice',
      startsAt: daysFromNow(0, 16, 30),
      endsAt: daysFromNow(0, 17, 30),
      categoryId: 'activity',
      visibilityKind: VisibilityKind.family,
      participants: { create: [{ memberId: mEmily.id }] },
    },
  });

  // --- An invitation that has not been accepted ---
  await prisma.invitation.create({
    data: {
      familyId: family.id,
      email: 'james.hale@example.com',
      code: 'FAM-J4K7',
      role: MemberRole.viewer,
      groupIds: [gGrandparents.id],
      invitedByMemberId: mAnna.id,
      expiresAt: daysFromNow(10),
    },
  });

  console.log(`
Seed data ready.

  Family:      ${family.name}  (${family.id})
  Groups:      Parents ${gParents.id} · Children ${gChildren.id} · Grandparents ${gGrandparents.id}

  Accounts (password: ${DEMO_PASSWORD}):
    anna.berg@example.com     admin
    martin.berg@example.com   member
    vera.berg@example.com     viewer

  To check visibility:
    "${school.title}"        whole family     → VISIBLE to Vera
    "${concert.title}"       parents+grandp.  → VISIBLE to Vera
    "${counsellor.title}"    parents only     → HIDDEN from Vera
    "${gift.title}"          Anna only        → HIDDEN from Vera
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
