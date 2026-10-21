// The launch work against a real PostgreSQL: a scratch database migrated from
// nothing, the reviewer's family written by its own script, and the API's own
// services asked - the subscription rows, the accepted terms, a closed family
// deleted a year on with its files. Never the family's database.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const API = path.resolve(__dirname, '../../apps/api/src');
/* eslint-disable @typescript-eslint/no-require-imports */
const { HousekeepingService } = require(`${API}/modules/housekeeping/housekeeping.service`);
const { StorageService } = require(`${API}/common/storage/storage.service`);
const { AuditService } = require(`${API}/common/audit.service`);
const { SubscriptionsService } = require(`${API}/modules/subscriptions/subscriptions.service`);
const { termsAccepted } = require(`${API}/modules/identity/auth.service`);

const url = process.env.CHECK_DATABASE_URL;
if (!url || !url.includes('famstory_launch_check')) throw new Error('Only ever the scratch database.');
const prisma = new PrismaClient({ datasourceUrl: url });

async function main() {
  const reviewer = await prisma.user.findUniqueOrThrow({
    where: { email: 'appreview@famstory.lv' },
    include: { members: { include: { family: true } } },
  });
  assert.equal(reviewer.members.length, 1, 'the reviewer is in one family');
  const family = reviewer.members[0].family;
  assert.equal(family.name, 'The Bergs');
  assert.equal(reviewer.termsVersion, '1.0', 'the reviewer accepted this version');
  const counts = {
    members: await prisma.member.count({ where: { familyId: family.id } }),
    events: await prisma.event.count({ where: { familyId: family.id } }),
    comments: await prisma.comment.count({ where: { event: { familyId: family.id } } }),
  };
  assert.deepEqual(counts, { members: 4, events: 5, comments: 3 });
  const martinEvents = await prisma.event.count({ where: { familyId: family.id, author: { displayName: 'Martin' } } });
  assert.equal(martinEvents, 1, "Martin wrote one entry to report and block");
  console.log('ok  reviewer family', counts);

  // --- Accepted terms, as the endpoint writes them.
  await prisma.user.update({ where: { id: reviewer.id }, data: termsAccepted('1.1') });
  const after = await prisma.user.findUniqueOrThrow({ where: { id: reviewer.id } });
  assert.equal(after.termsVersion, '1.1');
  assert.ok(after.termsAcceptedAt instanceof Date);
  console.log('ok  terms version stored');

  // --- Subscriptions: RevenueCat's answer written as a row, then taken away.
  let answer: unknown = {
    entitlements: { premium: { expires_date: '2099-01-01T00:00:00Z', product_identifier: 'famstory.premium.annual' } },
    subscriptions: { 'famstory.premium.annual': { store: 'app_store', is_sandbox: true } },
  };
  const revenueCat = { subscriber: async () => answer, webhookAuthorization: 'x', configured: true };
  const subscriptions = new SubscriptionsService(prisma, revenueCat);
  const bought = await subscriptions.sync(family.id);
  assert.equal(bought.plan, 'premium');
  const row = await prisma.subscription.findUniqueOrThrow({ where: { familyId: family.id } });
  assert.equal(row.store, 'app_store');
  assert.equal(row.sandbox, true);
  assert.equal(row.period, 'annual');
  answer = {};
  const moved = await subscriptions.sync(family.id);
  assert.equal(moved.plan, 'free');
  assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { familyId: family.id } })).status, 'expired');
  console.log('ok  subscription rows');

  // --- A family closed over a year ago, nobody left to sign in: deleted, files too.
  const media = mkdtempSync(path.join(tmpdir(), 'famstory-media-'));
  const folder = path.join(media, 'families', family.id, '2026');
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'cphoto1.jpg'), 'not really a photograph');
  const config = { get: (key: string) => (key === 'MEDIA_ROOT' ? media : undefined) };
  const storage = new StorageService(config);
  const audit = new AuditService(prisma);
  const housekeeping = new HousekeepingService(prisma, storage, audit);

  // Still reachable: nothing happens.
  await prisma.family.update({ where: { id: family.id }, data: { deletedAt: new Date(Date.now() - 400 * 864e5) } });
  assert.equal((await housekeeping.sweep()).families, 0, 'a member with an account keeps it');

  // Nobody left who can sign in.
  await prisma.member.updateMany({ where: { familyId: family.id }, data: { userId: null } });
  const swept = await housekeeping.sweep();
  assert.equal(swept.families, 1);
  assert.equal(await prisma.family.count({ where: { id: family.id } }), 0);
  assert.equal(await prisma.event.count({ where: { familyId: family.id } }), 0);
  assert.equal(await prisma.member.count({ where: { familyId: family.id } }), 0);
  assert.equal(existsSync(path.join(media, 'families', family.id)), false, 'its files went too');
  const purged = await prisma.auditLog.findFirst({ where: { action: 'family.purged', entityId: family.id } });
  assert.ok(purged, 'and the audit log says so');
  console.log('ok  closed family purged', swept);
}

main()
  .then(() => console.log('ALL OK'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
