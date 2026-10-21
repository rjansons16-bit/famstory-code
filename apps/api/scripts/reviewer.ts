/**
 * THE ACCOUNT APP REVIEW SIGNS IN WITH (docs/12-LAUNCH-RUNBOOK.md).
 *
 *     npm --prefix apps/api run reviewer               # make it, or give it a new password
 *     npm --prefix apps/api run reviewer -- --fresh    # and put its family back as it was
 *     npm --prefix apps/api run reviewer -- --email someone@famstory.lv
 *
 * On the server, through the image that runs the migrations:
 *
 *     docker compose -f tools/deploy/docker-compose.yml run --rm migrate npx ts-node scripts/reviewer.ts
 *
 * Apple and Google both sign in before they approve an app that needs an
 * account, and both want a family with something in it: entries to open, a
 * comment to report, somebody to block. This makes one - the Bergs, in
 * English, the language reviewers read - with the reviewer as its admin and
 * two relatives who wrote things, and prints the password ONCE. It is never
 * written anywhere: paste it into App Store Connect (App Review Information)
 * and Play Console (App access) and nowhere else.
 *
 * Running it again changes the password and signs out everywhere, so an old
 * password in an old submission stops working. If the reviewer deleted the
 * account (they are asked to try that), running it brings it back. --fresh
 * deletes the family and the three accounts and makes them again.
 *
 * The family is on the free plan, so a reviewer can buy Premium in the
 * stores' test environment; that purchase is marked as a test
 * (docs/02-DATA-MODEL.md, Subscriptions).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';

import { AuthProvider, MemberRole, MemberStatus, PrismaClient, ReactionKind, VisibilityKind } from '@prisma/client';

import { PasswordService } from '../src/modules/identity/password.service';

const FAMILY_NAME = 'The Bergs';
const RELATIVES = [
  { key: 'martin', name: 'Martin', role: MemberRole.member },
  { key: 'vera', name: 'Vera', role: MemberRole.viewer },
] as const;

/** Letters and digits nobody misreads in a review note: no 0/O, 1/l/I. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function password(): string {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return [group(), group(), group(), group()].join('-');
}

function day(offset: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function yearsAgo(years: number, inDays: number): Date {
  const d = day(inDays, 12);
  d.setFullYear(d.getFullYear() - years);
  return d;
}

/** The version of the terms this repository publishes, when it is here to read. */
function termsVersion(): string | null {
  const facts = path.resolve(__dirname, '..', '..', '..', 'docs', 'legal', 'facts.json');
  if (!existsSync(facts)) return null;
  const version = (JSON.parse(readFileSync(facts, 'utf8')) as { version?: unknown }).version;
  return typeof version === 'string' && version ? version : null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const at = args.indexOf('--email');
  const email = (at >= 0 ? args[at + 1] : 'appreview@famstory.lv')?.trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('--email needs an address');
  const [local, domain] = email.split('@');
  const relativeEmail = (key: string) => `${local}+${key}@${domain}`;

  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  const secret = password();
  const terms = termsVersion();
  const accepted = terms ? { termsVersion: terms, termsAcceptedAt: new Date() } : {};

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, members: { select: { familyId: true } } },
    });

    if (existing && args.includes('--fresh')) {
      const familyIds = existing.members.map((m) => m.familyId);
      await prisma.family.deleteMany({ where: { id: { in: familyIds } } });
      await prisma.user.deleteMany({
        where: { email: { in: [email, ...RELATIVES.map((r) => relativeEmail(r.key))] } },
      });
    }

    const reviewer = await prisma.user.findUnique({
      where: { email },
      select: { id: true, members: { where: { status: MemberStatus.active }, select: { id: true } } },
    });

    if (reviewer && reviewer.members.length > 0) {
      // There already: a new password, every session gone, a deletion undone.
      await prisma.$transaction([
        prisma.user.update({
          where: { id: reviewer.id },
          data: { passwordHash: await passwords.hash(secret), deletedAt: null, ...accepted },
        }),
        prisma.refreshToken.updateMany({
          where: { userId: reviewer.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      print(email, secret, 'a new password; the family is as the reviewer left it');
      return;
    }

    if (reviewer) {
      // An account left without its family (erased, or removed from it):
      // start again under the same address.
      await prisma.user.delete({ where: { id: reviewer.id } });
    }
    await prisma.user.deleteMany({ where: { email: { in: RELATIVES.map((r) => relativeEmail(r.key)) } } });

    await createFamily(prisma, passwords, email, secret, relativeEmail, accepted);
    print(email, secret, 'a new family');
  } finally {
    await prisma.$disconnect();
  }
}

async function createFamily(
  prisma: PrismaClient,
  passwords: PasswordService,
  email: string,
  secret: string,
  relativeEmail: (key: string) => string,
  accepted: { termsVersion?: string; termsAcceptedAt?: Date },
): Promise<void> {
  const account = (address: string, displayName: string, hash: string) =>
    prisma.user.create({
      data: {
        email: address,
        passwordHash: hash,
        displayName,
        locale: 'en',
        emailVerifiedAt: new Date(),
        ...accepted,
        identities: { create: { provider: AuthProvider.email, providerUserId: address } },
      },
    });

  // The relatives sign in with nothing anybody knows: a password made and
  // thrown away here.
  const unusable = await passwords.hash(password() + password());
  const anna = await account(email, 'Anna', await passwords.hash(secret));
  const [martin, vera] = await Promise.all(
    RELATIVES.map((r) => account(relativeEmail(r.key), r.name, unusable)),
  );

  const family = await prisma.family.create({ data: { name: FAMILY_NAME, locale: 'en', createdAt: day(-200) } });
  const member = (data: {
    userId: string | null;
    displayName: string;
    role: MemberRole;
    birthDate: Date;
    managedByMemberId?: string;
  }) => prisma.member.create({ data: { familyId: family.id, status: MemberStatus.active, joinedAt: day(-200), ...data } });

  const mAnna = await member({ userId: anna.id, displayName: 'Anna', role: MemberRole.admin, birthDate: yearsAgo(36, 40) });
  const mMartin = await member({ userId: martin.id, displayName: 'Martin', role: MemberRole.member, birthDate: yearsAgo(39, 12) });
  const mVera = await member({ userId: vera.id, displayName: 'Vera', role: MemberRole.viewer, birthDate: yearsAgo(68, 5) });
  const mEmily = await member({
    userId: null,
    displayName: 'Emily',
    role: MemberRole.child,
    birthDate: yearsAgo(7, 90),
    managedByMemberId: mAnna.id,
  });

  const group = (name: string, icon: string, memberIds: string[]) =>
    prisma.group.create({
      data: {
        familyId: family.id,
        name,
        icon,
        isSystem: true,
        members: { create: memberIds.map((memberId) => ({ memberId })) },
      },
    });
  const parents = await group('Parents', 'parents', [mAnna.id, mMartin.id]);
  await group('Children', 'children', [mEmily.id]);
  const grandparents = await group('Grandparents', 'grandparents', [mVera.id]);

  await prisma.event.create({
    data: {
      familyId: family.id,
      authorMemberId: mAnna.id,
      title: "Emily's first day of school",
      description: 'She wanted to walk in alone, then looked back at the door anyway.',
      startsAt: day(-21, 8),
      categoryId: 'education',
      isMilestone: true,
      visibilityKind: VisibilityKind.family,
      participants: { create: [{ memberId: mEmily.id }, { memberId: mAnna.id }, { memberId: mMartin.id }] },
      reactions: {
        create: [
          { memberId: mMartin.id, kind: ReactionKind.heart },
          { memberId: mVera.id, kind: ReactionKind.heart },
        ],
      },
      comments: {
        create: [
          { authorMemberId: mVera.id, body: 'How grown up she looks!', createdAt: day(-21, 19) },
          { authorMemberId: mMartin.id, body: 'The one by the gate is the best photo.', createdAt: day(-20, 8) },
        ],
      },
    },
  });

  // Martin's own, for reporting and blocking: open it, then "..." or his profile.
  await prisma.event.create({
    data: {
      familyId: family.id,
      authorMemberId: mMartin.id,
      title: 'Fishing at the lake',
      description: 'Two perch and a very patient morning.',
      startsAt: day(-9, 7),
      categoryId: 'activity',
      visibilityKind: VisibilityKind.family,
      participants: { create: [{ memberId: mMartin.id }] },
      comments: { create: [{ authorMemberId: mAnna.id, body: 'Next time take Emily along.', createdAt: day(-9, 12) }] },
    },
  });

  await prisma.event.create({
    data: {
      familyId: family.id,
      authorMemberId: mAnna.id,
      title: 'Parent meeting at school',
      description: 'Only the parents see this one: it is about a child.',
      startsAt: day(-4, 17),
      categoryId: 'education',
      visibilityKind: VisibilityKind.groups,
      visibility: { create: [{ groupId: parents.id }] },
      participants: { create: [{ memberId: mEmily.id }, { memberId: mAnna.id }] },
    },
  });

  await prisma.event.create({
    data: {
      familyId: family.id,
      authorMemberId: mAnna.id,
      title: "Emily's school concert",
      description: 'In the assembly hall. Grandma is coming.',
      startsAt: day(10, 18),
      categoryId: 'education',
      visibilityKind: VisibilityKind.groups,
      visibility: { create: [{ groupId: parents.id }, { groupId: grandparents.id }] },
      participants: { create: [{ memberId: mEmily.id }, { memberId: mVera.id }] },
      reminders: { create: { minutesBefore: 1440, scheduledFor: day(9, 18) } },
    },
  });

  await prisma.event.create({
    data: {
      familyId: family.id,
      authorMemberId: mAnna.id,
      title: 'Sunday lunch at Grandma Vera',
      startsAt: day(3, 13),
      categoryId: 'celebration',
      visibilityKind: VisibilityKind.family,
      participants: { create: [{ memberId: mVera.id }, { memberId: mAnna.id }, { memberId: mMartin.id }, { memberId: mEmily.id }] },
    },
  });
}

function print(email: string, secret: string, what: string): void {
  console.log(`
App Review account ready (${what}).

  Sign in:   ${email}
  Password:  ${secret}

  Shown once and kept nowhere: paste it now into App Store Connect (App
  Review Information) and Play Console (App content, App access).

  The family: Anna (the reviewer, admin), Martin (member), Vera (viewer),
  Emily (a child profile). To try reporting and blocking, open Martin's
  "Fishing at the lake" and use "...", or Martin's profile.
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
