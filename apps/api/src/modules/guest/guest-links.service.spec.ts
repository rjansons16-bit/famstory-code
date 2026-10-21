import { createHash } from 'node:crypto';

import { MemberRole } from '@prisma/client';

import type { AuditService } from '../../common/audit.service';
import type { PrismaService } from '../../common/prisma.service';
import type { StorageService } from '../../common/storage/storage.service';
import type { ViewerContext, VisibilityService } from '../visibility/visibility.service';
import { GuestLinksService } from './guest-links.service';

/**
 * A guest link is the one way an event leaves the family. The tests are the
 * ways it must stop: expired, withdrawn, deleted, shared by somebody who left,
 * made by somebody who merely could see it.
 */

const ANNA: ViewerContext = { memberId: 'mem_anna', familyId: 'fam_1', role: MemberRole.member, groupIds: [] };
const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';

function link(patch: Record<string, unknown> = {}) {
  return {
    id: 'lnk_1',
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    createdBy: { displayName: 'Anna Berga', status: 'active' },
    family: { name: 'The Bergs', deletedAt: null },
    event: {
      id: 'evt_1',
      familyId: 'fam_1',
      title: 'Birthday',
      description: 'Cake at four.',
      startsAt: new Date('2026-10-04T13:00:00Z'),
      endsAt: null,
      allDay: false,
      categoryId: 'celebration',
      deletedAt: null,
      participants: [{ member: { role: MemberRole.member } }],
      attachments: [
        { kind: 'image', storageKey: 'families/f/2026/a.jpg', thumbnailKey: null, width: 10, height: 10, durationSec: null },
        { kind: 'audio', storageKey: 'families/f/2026/v.webm', thumbnailKey: null, width: null, height: null, durationSec: 4 },
      ],
    },
    ...patch,
  };
}

function build(options: { author?: string; found?: unknown; event?: Record<string, unknown> } = {}) {
  const prisma = {
    event: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        authorMemberId: options.author ?? 'mem_anna',
        sealedUntil: null,
        hiddenFromMemberId: null,
        revealAt: null,
        participants: [{ member: { role: MemberRole.child } }],
        ...options.event,
      }),
    },
    eventShareLink: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'lnk_1', ...data })),
      findUnique: jest.fn().mockResolvedValue(options.found === undefined ? link() : options.found),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const visibility = { assertCanOpenEvent: jest.fn().mockResolvedValue(undefined) };
  const storage = { signedUrl: (key: string) => ({ url: `https://x/v1/media/${key}?sig`, expiresIn: 1800 }) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new GuestLinksService(
    prisma as unknown as PrismaService,
    visibility as unknown as VisibilityService,
    storage as unknown as StorageService,
    audit as unknown as AuditService,
  );
  return { service, prisma, audit, visibility };
}

describe('Making a link', () => {
  it('keeps only the hash, and hands the token out once, in the URL', async () => {
    const { service, prisma } = build();
    const made = await service.create(ANNA, 'evt_1', 7, 'http://h:8081');

    const token = made.url.split('/guest/')[1];
    expect(prisma.eventShareLink.create.mock.calls[0][0].data.tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(JSON.stringify(prisma.eventShareLink.create.mock.calls)).not.toContain(token);
  });

  it('only whoever wrote the event, or an admin', async () => {
    const { service } = build({ author: 'mem_martin' });
    await expect(service.create(ANNA, 'evt_1', 7, 'http://h')).rejects.toMatchObject({ status: 403 });

    const admin = { ...ANNA, role: MemberRole.admin };
    await expect(service.create(admin, 'evt_1', 7, 'http://h')).resolves.toBeDefined();
  });

  it('is written down, saying when a child is in it', async () => {
    const { service, audit } = build();
    await service.create(ANNA, 'evt_1', 1, 'http://h');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'guest_link.created',
        metadata: { days: 1, heirloom: false, childInvolved: true },
      }),
    );
  });

  it('a lifetime it does not offer becomes a week, never forever', async () => {
    const { service, prisma } = build();
    await service.create(ANNA, 'evt_1', 3650, 'http://h');
    const expires = prisma.eventShareLink.create.mock.calls[0][0].data.expiresAt as Date;
    expect(expires.getTime() - Date.now()).toBeLessThanOrEqual(7 * 86_400_000 + 1000);
  });
});

describe('Opening a link', () => {
  it('shows the words, the date and the photographs - and nobody', async () => {
    const { service } = build();
    const view = await service.open(TOKEN, 'http://h');

    expect(view?.event.title).toBe('Birthday');
    expect(view?.sharedBy).toBe('Anna');
    expect(view?.event.photos).toHaveLength(1);
    expect(JSON.stringify(view)).not.toMatch(/participants|comments|visibility|memberId/);
  });

  it('carries no voice: that stays in the family', async () => {
    const view = await build().service.open(TOKEN, 'http://h');
    expect(view?.heirloom).toBe(false);
    expect(view?.event.voiceNotes).toEqual([]);
  });

  it.each([
    ['expired', link({ expiresAt: new Date(Date.now() - 1000) })],
    ['withdrawn', link({ revokedAt: new Date() })],
    ['for a deleted event', link({ event: { ...link().event, deletedAt: new Date() } })],
    ['shared by somebody who has left', link({ createdBy: { displayName: 'A', status: 'removed' } })],
    [
      'to a capsule sealed since it was shared',
      link({ event: { ...link().event, sealedUntil: new Date(Date.now() + 86_400_000) } }),
    ],
    [
      'to a surprise whose day has not come',
      link({
        event: {
          ...link().event,
          hiddenFromMemberId: 'mem_vera',
          revealAt: new Date(Date.now() + 86_400_000),
        },
      }),
    ],
    ['unknown', null],
  ])('shows nothing when it is %s', async (_label, found) => {
    const { service } = build({ found });
    await expect(service.open(TOKEN, 'http://h')).resolves.toBeNull();
  });

  it('refuses anything not shaped like a token before asking the database', async () => {
    const { service, prisma } = build();
    await expect(service.open('../../x', 'http://h')).resolves.toBeNull();
    expect(prisma.eventShareLink.findUnique).not.toHaveBeenCalled();
  });

  it("writes down a guest's view of a child's event", async () => {
    const withChild = link({
      event: { ...link().event, participants: [{ member: { role: MemberRole.child } }] },
    });
    const { service, audit } = build({ found: withChild });
    await service.open(TOKEN, 'http://h');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'guest_link.viewed' }));
  });
});

describe('An heirloom sticker', () => {
  it('is made to last a century, and the audit says what it is', async () => {
    const { service, prisma, audit } = build();
    const made = await service.create(ANNA, 'evt_1', 7, 'http://h', true);

    const expires = prisma.eventShareLink.create.mock.calls[0][0].data.expiresAt as Date;
    expect(expires.getTime() - Date.now()).toBeGreaterThan(99 * 365 * 86_400_000);
    expect(made.heirloom).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ heirloom: true }) }),
    );
  });

  it('carries the voice with the photographs - the one link that does', async () => {
    const { service } = build({ found: link({ heirloom: true }) });
    const view = await service.open(TOKEN, 'http://h');

    expect(view?.heirloom).toBe(true);
    expect(view?.event.photos).toHaveLength(1);
    expect(view?.event.voiceNotes).toEqual([{ url: expect.stringContaining('v.webm'), durationSec: 4 }]);
  });
});

describe('What may not leave the family early', () => {
  it('a sealed time capsule, not even by its author', async () => {
    const { service, prisma } = build({ event: { sealedUntil: new Date(Date.now() + 86_400_000) } });
    await expect(service.create(ANNA, 'evt_1', 7, 'http://h')).rejects.toMatchObject({
      response: { code: 'capsule_sealed' },
    });
    expect(prisma.eventShareLink.create).not.toHaveBeenCalled();
  });

  it('a surprise before its day', async () => {
    const { service } = build({
      event: { hiddenFromMemberId: 'mem_vera', revealAt: new Date(Date.now() + 86_400_000) },
    });
    await expect(service.create(ANNA, 'evt_1', 7, 'http://h')).rejects.toMatchObject({
      response: { code: 'surprise_not_ready' },
    });
  });
});
