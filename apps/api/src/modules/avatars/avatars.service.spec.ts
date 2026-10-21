import { Readable } from 'node:stream';

import { MemberRole } from '@prisma/client';
import sharp from 'sharp';

import type { AuditService } from '../../common/audit.service';
import type { PrismaService } from '../../common/prisma.service';
import type { StorageService } from '../../common/storage/storage.service';
import type { ViewerContext } from '../visibility/visibility.service';
import { AvatarsService, MAX_AVATAR_BYTES } from './avatars.service';

/**
 * Whose face can be changed, what arrives on disk, and what is refused.
 * A real image goes through sharp here: a mocked resize would prove nothing.
 */

const ANNA: ViewerContext = { memberId: 'mem_anna', familyId: 'fam_1', role: MemberRole.member, groupIds: [] };

async function photo(width = 1200, height = 800): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 80 } } })
    .jpeg()
    .toBuffer();
}

function build(target: Record<string, unknown> = {}) {
  const written: { key: string; data: Buffer }[] = [];
  const prisma = {
    member: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'mem_anna',
        role: MemberRole.member,
        managedByMemberId: null,
        avatarKey: null,
        ...target,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const storage = {
    avatarKeyFor: (familyId: string, memberId: string) => `families/${familyId}/avatars/${memberId}abcd.webp`,
    writeBuffer: jest.fn(async (key: string, data: Buffer) => {
      written.push({ key, data });
    }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new AvatarsService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
    audit as unknown as AuditService,
  );
  return { service, prisma, storage, audit, written };
}

describe('Setting a photograph', () => {
  it('stores a 512px square WebP, whatever shape came in', async () => {
    const { service, written, prisma } = build();
    await service.set(ANNA, 'mem_anna', 'image/jpeg', Readable.from(await photo()));

    const meta = await sharp(written[0].data).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([512, 512]);
    expect(prisma.member.update.mock.calls[0][0].data).toEqual({
      avatarKey: 'families/fam_1/avatars/mem_annaabcd.webp',
      avatarUrl: null,
    });
  });

  it('removes the old file once the new one is in place', async () => {
    const { service, storage } = build({ avatarKey: 'families/fam_1/avatars/mem_annaold1.webp' });
    await service.set(ANNA, 'mem_anna', 'image/png', Readable.from(await photo(100, 100)));
    expect(storage.remove).toHaveBeenCalledWith('families/fam_1/avatars/mem_annaold1.webp');
  });

  it("a parent sets their child's, and it is written down", async () => {
    const { service, audit } = build({ id: 'mem_emily', role: MemberRole.child, managedByMemberId: 'mem_anna' });
    await service.set(ANNA, 'mem_emily', 'image/jpeg', Readable.from(await photo(300, 300)));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'child_profile.updated' }));
  });

  it("nobody else sets another adult's", async () => {
    const { service } = build({ id: 'mem_martin' });
    await expect(
      service.set(ANNA, 'mem_martin', 'image/jpeg', Readable.from(await photo(10, 10))),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('refuses what is not a photograph, and what is too large', async () => {
    const { service } = build();
    await expect(
      service.set(ANNA, 'mem_anna', 'application/pdf', Readable.from(Buffer.from('%PDF'))),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.set(ANNA, 'mem_anna', 'image/jpeg', Readable.from(Buffer.from('not an image at all'))),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.set(ANNA, 'mem_anna', 'image/jpeg', Readable.from([Buffer.alloc(MAX_AVATAR_BYTES + 1)])),
    ).rejects.toMatchObject({ status: 413 });
  });
});
