import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MemberRole } from '@prisma/client';

import type { PrismaService } from '../../common/prisma.service';
import { READ_TTL_SECONDS, StorageService } from '../../common/storage/storage.service';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';
import { MediaService } from './media.service';

/**
 * Media access tests.
 *
 * The signing is not the risky part — the check before it is. A photograph
 * reachable through a permanent link would defeat the whole visibility model,
 * so most of these are about WHO may ask for a URL. The rest are about the two
 * properties of the URL itself that carry the guarantee: it names one key, and
 * it cannot be edited into naming another.
 */

const BASE = 'https://famstory.example';

function ctx(overrides: Partial<ViewerContext> = {}): ViewerContext {
  return {
    memberId: 'mem_vera',
    familyId: 'fam_1',
    role: MemberRole.viewer,
    groupIds: [],
    ...overrides,
  };
}

function build(options: { attachment?: unknown; eventVisible?: boolean } = {}) {
  const findFirstAttachment = jest.fn().mockResolvedValue(
    options.attachment === undefined
      ? {
          storageKey: 'families/fam1/2026/att1.jpg',
          thumbnailKey: 'families/fam1/2026/att1_thumb.jpg',
          eventId: 'evt_1',
        }
      : options.attachment,
  );

  const prisma = {
    attachment: { findFirst: findFirstAttachment },
    // assertCanSeeEvent runs its own query; `null` means "not visible". And
    // an open event: no time capsule keeping its photographs.
    event: {
      findFirst: jest.fn().mockResolvedValue(options.eventVisible === false ? null : { id: 'evt_1' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ sealedUntil: null, authorMemberId: 'mem_x' }),
    },
  } as unknown as PrismaService;

  const visibility = new VisibilityService(prisma);
  const config = { get: (key: string) => (key === 'MEDIA_SIGNING_SECRET' ? 'test-secret' : undefined) };
  const storage = new StorageService(config as unknown as ConfigService);

  return {
    service: new MediaService(prisma, visibility, storage),
    storage,
    prisma,
    findFirstAttachment,
  };
}

/** The key and the query a signed URL carries. */
function parse(url: string): { key: string; expires: string; signature: string } {
  const parsed = new URL(url);
  return {
    key: decodeURI(parsed.pathname.replace('/v1/media/', '')),
    expires: parsed.searchParams.get('expires') ?? '',
    signature: parsed.searchParams.get('signature') ?? '',
  };
}

describe('MediaService — who may ask for a URL', () => {
  it('an attachment from another family is not found', async () => {
    const { service } = build({ attachment: null });
    await expect(service.urlFor(ctx(), 'att_1', 'original', BASE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('the query is pinned to the family, and to bytes that actually arrived', async () => {
    const { service, findFirstAttachment } = build();
    await service.urlFor(ctx(), 'att_1', 'original', BASE).catch(() => undefined);

    const where = findFirstAttachment.mock.calls[0][0].where;
    expect(where.id).toBe('att_1');
    expect(where.event.familyId).toBe('fam_1');
    // An upload that never completed is not a photograph, it is a row.
    expect(where.uploadedAt).toEqual({ not: null });
  });

  it('an attachment on an invisible event is refused', async () => {
    const { service } = build({ eventVisible: false });
    await expect(service.urlFor(ctx(), 'att_1', 'original', BASE)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('the refusal does not reveal whether the event exists', async () => {
    const { service } = build({ eventVisible: false });
    await service.urlFor(ctx(), 'att_1', 'original', BASE).catch((error: ForbiddenException) => {
      expect(error.getResponse()).toMatchObject({ code: 'visibility_denied' });
    });
    expect.assertions(1);
  });

  it('a visible event gets a URL', async () => {
    const { service } = build({ eventVisible: true });
    const { url, expiresIn } = await service.urlFor(ctx(), 'att_1', 'original', BASE);

    expect(url.startsWith(`${BASE}/v1/media/`)).toBe(true);
    expect(expiresIn).toBe(READ_TTL_SECONDS);
  });
});

describe('MediaService — variants', () => {
  it('the thumbnail variant uses the thumbnail key', async () => {
    const { service } = build();
    const { url } = await service.urlFor(ctx(), 'att_1', 'thumb', BASE);

    expect(parse(url).key).toBe('families/fam1/2026/att1_thumb.jpg');
  });

  it('an attachment with no thumbnail falls back to the original', async () => {
    const { service } = build({
      attachment: {
        storageKey: 'families/fam1/2026/att1.jpg',
        thumbnailKey: null,
        eventId: 'evt_1',
      },
    });

    const { url } = await service.urlFor(ctx(), 'att_1', 'thumb', BASE);

    expect(parse(url).key).toBe('families/fam1/2026/att1.jpg');
  });
});

describe('MediaService — the URL itself', () => {
  it('verifies for the key it was signed for', async () => {
    const { service, storage } = build();
    const { url } = await service.urlFor(ctx(), 'att_1', 'original', BASE);
    const { key, expires, signature } = parse(url);

    expect(storage.verify(key, expires, signature)).toBe(true);
  });

  it('does not verify for another key', async () => {
    const { service, storage } = build();
    const { url } = await service.urlFor(ctx(), 'att_1', 'original', BASE);
    const { expires, signature } = parse(url);

    // The whole point: one link is a link to one photograph, not to a folder.
    expect(storage.verify('families/fam1/2026/att2.jpg', expires, signature)).toBe(false);
  });

  it('does not verify with the expiry moved', async () => {
    const { service, storage } = build();
    const { url } = await service.urlFor(ctx(), 'att_1', 'original', BASE);
    const { key, expires, signature } = parse(url);

    expect(storage.verify(key, String(Number(expires) + 3600), signature)).toBe(false);
  });

  it('refuses a link that has run out', async () => {
    const { storage } = build();
    const past = Math.floor(Date.now() / 1000) - 10;

    expect(storage.verify('families/fam1/2026/att1.jpg', String(past), 'anything')).toBe(false);
  });

  it('refuses a key that is not one this server issues', async () => {
    const { storage } = build();
    const soon = String(Math.floor(Date.now() / 1000) + 300);

    for (const key of ['../../../etc/passwd', '/etc/passwd', 'families/../secret.jpg', '']) {
      expect(storage.verify(key, soon, 'anything')).toBe(false);
    }
  });
});
