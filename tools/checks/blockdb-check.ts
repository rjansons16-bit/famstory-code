// Blocks against a real PostgreSQL: a scratch database migrated from nothing,
// a small family written into it, and the API's own services asked - so the
// SQL Prisma makes of eventFilter's new branch is what is checked, not its shape.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import path from 'node:path';
import { MemberRole, NotificationKind, PrismaClient } from '@prisma/client';

const API = path.resolve(__dirname, '../../apps/api/src/modules');
/* eslint-disable @typescript-eslint/no-require-imports */
const { VisibilityService } = require(`${API}/visibility/visibility.service`);
const { EventsService } = require(`${API}/events/events.service`);
const { CommentsService } = require(`${API}/comments/comments.service`);
const { NotificationsService } = require(`${API}/notifications/notifications.service`);
const { BlocksService } = require(`${API}/blocks/blocks.service`);

const url = process.env.CHECK_DATABASE_URL;
if (!url || !url.includes('famstory_block_check')) throw new Error('Only ever the scratch database.');
const prisma = new PrismaClient({ datasourceUrl: url });

async function main() {
  const visibility = new VisibilityService(prisma);
  const notifications = new NotificationsService(prisma, visibility);
  const events = new EventsService(prisma, visibility, { record: async () => undefined }, notifications);
  const comments = new CommentsService(prisma, visibility, notifications);
  const blocks = new BlocksService(prisma);

  const user = (name: string) =>
    prisma.user.create({ data: { email: `${name}@check.invalid`, displayName: name } });
  const [ua, um, uv] = [await user('anna'), await user('martin'), await user('vera')];
  const family = await prisma.family.create({ data: { name: 'Check' } });
  const member = (userId: string | null, name: string, role: MemberRole) =>
    prisma.member.create({ data: { familyId: family.id, userId, displayName: name, role } });
  const anna = await member(ua.id, 'Anna', MemberRole.admin);
  const martin = await member(um.id, 'Martin', MemberRole.member);
  const vera = await member(uv.id, 'Vera', MemberRole.viewer);

  const entry = (authorMemberId: string, title: string) =>
    prisma.event.create({
      data: { familyId: family.id, authorMemberId, title, startsAt: new Date(), categoryId: 'other' },
    });
  const byMartin = await entry(martin.id, 'by martin');
  const byAnna = await entry(anna.id, 'by anna');
  await prisma.comment.createMany({
    data: [
      { eventId: byAnna.id, authorMemberId: martin.id, body: 'martin says' },
      { eventId: byAnna.id, authorMemberId: vera.id, body: 'vera says' },
    ],
  });
  await prisma.reaction.createMany({
    data: [
      { eventId: byAnna.id, memberId: martin.id, kind: 'heart' },
      { eventId: byAnna.id, memberId: vera.id, kind: 'smile' },
    ],
  });
  await prisma.notification.createMany({
    data: [
      { familyId: family.id, memberId: anna.id, kind: NotificationKind.event_created, eventId: byMartin.id, actorMemberId: martin.id },
      { familyId: family.id, memberId: anna.id, kind: NotificationKind.comment_added, eventId: byAnna.id, actorMemberId: martin.id },
      { familyId: family.id, memberId: anna.id, kind: NotificationKind.comment_added, eventId: byAnna.id, actorMemberId: vera.id },
      { familyId: family.id, memberId: anna.id, kind: NotificationKind.special_day, dayKey: 'check', dayOn: new Date() },
    ],
  });

  const annaCtx = await visibility.contextFor(ua.id, family.id);
  const martinCtx = await visibility.contextFor(um.id, family.id);
  const titles = async (ctx: unknown) => (await events.list(ctx, {})).items.map((e: { title: string }) => e.title).sort();
  const annasEntry = async () => (await events.list(annaCtx, {})).items.find((e: { id: string }) => e.id === byAnna.id);

  // Before.
  assert.deepEqual(await titles(annaCtx), ['by anna', 'by martin']);
  assert.equal((await annasEntry())._count.comments, 2);
  assert.equal((await annasEntry()).reactions.length, 2);
  assert.equal((await notifications.listFor(annaCtx)).length, 4);
  console.log('ok   before: everything is there');

  await blocks.block(annaCtx, martin.id);
  await blocks.block(annaCtx, martin.id);
  assert.equal(await prisma.memberBlock.count(), 1);
  console.log('ok   blocked, twice is once');

  assert.deepEqual(await titles(annaCtx), ['by anna']);
  console.log("ok   the timeline leaves out martin's entry (eventFilter, real SQL)");
  await assert.rejects(visibility.assertCanSeeEvent(annaCtx, byMartin.id));
  console.log('ok   opening it directly is refused');
  assert.equal((await annasEntry())._count.comments, 1);
  assert.deepEqual((await annasEntry()).reactions.map((r: { memberId: string }) => r.memberId), [vera.id]);
  console.log("ok   his comment and reaction leave the counts on anna's entry");
  assert.deepEqual((await comments.list(annaCtx, byAnna.id)).map((c: { body: string }) => c.body), ['vera says']);
  console.log('ok   and the comment list');
  const bell = await notifications.listFor(annaCtx);
  assert.deepEqual(bell.map((n: { kind: string; actorName: string | null }) => `${n.kind}:${n.actorName}`).sort(), [
    'comment_added:Vera',
    'special_day:null',
  ]);
  console.log('ok   the bell keeps vera and the special day, drops both of martin\'s');

  // For martin, and for vera, nothing changed.
  assert.deepEqual(await titles(martinCtx), ['by anna', 'by martin']);
  assert.equal((await comments.list(martinCtx, byAnna.id)).length, 2);
  console.log('ok   the blocked member sees everything as before');

  // A new comment by martin on anna's entry: anna is not told; vera, who is in the conversation, is.
  await prisma.notification.deleteMany();
  await notifications.commentAdded(family.id, byAnna.id, martin.id);
  const told = (await prisma.notification.findMany({ select: { memberId: true } })).map((n) => n.memberId).sort();
  assert.deepEqual(told, [vera.id]);
  console.log('ok   a new comment by martin tells vera, not anna');

  // Not yourself, not outside.
  await assert.rejects(blocks.block(annaCtx, anna.id));
  await assert.rejects(blocks.block(annaCtx, 'mem_nowhere'));
  console.log('ok   not yourself, not somebody who is not there');

  await blocks.unblock(annaCtx, martin.id);
  await blocks.unblock(annaCtx, martin.id);
  assert.deepEqual(await titles(annaCtx), ['by anna', 'by martin']);
  assert.equal((await annasEntry())._count.comments, 2);
  console.log('ok   unblocked: all of it is back');
}

main()
  .then(() => console.log('\nall checks passed'))
  .catch((error) => {
    console.error('FAILED:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
