import { BadRequestException, ForbiddenException, PayloadTooLargeException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MemberRole } from '@prisma/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';

import type { AuditService } from '../../common/audit.service';
import type { PrismaService } from '../../common/prisma.service';
import { MAX_AUDIO_BYTES, MAX_UPLOAD_BYTES, StorageService } from '../../common/storage/storage.service';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';
import { UploadsService } from './uploads.service';

/**
 * Uploading a photograph.
 *
 * Run against a real StorageService pointed at a temporary directory and a
 * real image, because the two things most likely to be wrong here cannot be
 * seen in a mock: whether the bytes actually land somewhere, and whether a
 * thumbnail comes back out. The database is faked; the disk is not.
 */

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'famstory-media-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function ctx(overrides: Partial<ViewerContext> = {}): ViewerContext {
  return {
    memberId: 'memanna',
    familyId: 'fam1',
    role: MemberRole.admin,
    groupIds: [],
    ...overrides,
  };
}

async function photograph(width = 1600, height = 1200): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 35, g: 78, b: 66 } },
  })
    .jpeg()
    .toBuffer();
}

function build(
  options: {
    attachments?: number;
    voiceNotes?: number;
    eventVisible?: boolean;
    premium?: boolean;
    author?: string;
  } = {},
) {
  const rows = new Map<string, Record<string, unknown>>();
  let nextId = 0;

  const prisma = {
    attachment: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `att${++nextId}`;
        rows.set(id, { id, createdAt: new Date(), uploadedAt: null, ...data });
        return { id };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        rows.set(where.id, { ...rows.get(where.id), ...data });
        return rows.get(where.id);
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id)),
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = rows.get(where.id);
        return row ? { ...row, event: { authorMemberId: options.author ?? 'memanna' } } : null;
      }),
      findMany: jest.fn(async () => [...rows.values()]),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        rows.delete(where.id);
        return {};
      }),
      // Photographs and voice notes are counted against separate limits.
      count: jest.fn(async ({ where }: { where: { kind?: unknown } }) =>
        where.kind === 'audio' ? (options.voiceNotes ?? 0) : (options.attachments ?? 0),
      ),
    },
    event: {
      findFirst: jest.fn(async () =>
        options.eventVisible === false
          ? null
          : { id: 'evt1', authorMemberId: 'memanna', familyId: 'fam1' },
      ),
      // Open, not a sealed time capsule (VisibilityService.assertCanOpenEvent).
      findUniqueOrThrow: jest.fn(async () => ({ sealedUntil: null, authorMemberId: 'memanna' })),
    },
    subscription: {
      findUnique: jest.fn(async () =>
        options.premium ? { plan: 'premium', status: 'active', currentPeriodEnd: null } : null,
      ),
    },
  } as unknown as PrismaService;

  const config = {
    get: (key: string) =>
      key === 'MEDIA_ROOT' ? root : key === 'MEDIA_SIGNING_SECRET' ? 'test-secret' : undefined,
  };

  const storage = new StorageService(config as unknown as ConfigService);
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new UploadsService(
    prisma,
    storage,
    new VisibilityService(prisma),
    audit as unknown as AuditService,
  );

  return { service, storage, prisma, rows, audit };
}

/** The whole three-step dance, as the app performs it. */
async function upload(
  service: UploadsService,
  bytes: Buffer,
  mimeType = 'image/jpeg',
): Promise<{ attachmentId: string; uploadUrl: string }> {
  const target = await service.requestUpload(
    ctx(),
    'evt1',
    { mimeType, sizeBytes: bytes.length },
    'https://famstory.example',
  );

  const query = Object.fromEntries(new URL(target.uploadUrl).searchParams);
  await service.receive(target.attachmentId, query, Readable.from(bytes));

  return target;
}

describe('Asking to upload', () => {
  it('refuses anything that is not a photograph', async () => {
    const { service } = build();

    await expect(
      service.requestUpload(ctx(), 'evt1', { mimeType: 'video/mp4', sizeBytes: 1000 }, 'https://x'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a file over the limit before a byte is sent', async () => {
    const { service } = build();

    await expect(
      service.requestUpload(
        ctx(),
        'evt1',
        { mimeType: 'image/jpeg', sizeBytes: MAX_UPLOAD_BYTES + 1 },
        'https://x',
      ),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('refuses an event this person cannot see', async () => {
    const { service } = build({ eventVisible: false });

    await expect(
      service.requestUpload(ctx(), 'evt1', { mimeType: 'image/jpeg', sizeBytes: 100 }, 'https://x'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses once the event has as many photographs as the plan allows', async () => {
    const { service } = build({ attachments: 3 });

    await expect(
      service.requestUpload(ctx(), 'evt1', { mimeType: 'image/jpeg', sizeBytes: 100 }, 'https://x'),
    ).rejects.toMatchObject({ response: { code: 'plan_limit_reached', limit: 3 } });
  });

  it('lets a premium family past the free limit', async () => {
    const { service } = build({ attachments: 3, premium: true });

    await expect(
      service.requestUpload(ctx(), 'evt1', { mimeType: 'image/jpeg', sizeBytes: 100 }, 'https://x'),
    ).resolves.toMatchObject({ method: 'PUT' });
  });

  it('hands back a URL that names the attachment it created', async () => {
    const { service } = build();

    const target = await service.requestUpload(
      ctx(),
      'evt1',
      { mimeType: 'image/jpeg', sizeBytes: 100 },
      'https://famstory.example',
    );

    expect(target.uploadUrl).toContain(`/v1/uploads/${target.attachmentId}/bytes`);
    expect(target.uploadUrl).toContain('signature=');
  });
});

describe('Sending the bytes', () => {
  it('refuses a link with the wrong signature', async () => {
    const { service } = build();
    const target = await service.requestUpload(
      ctx(),
      'evt1',
      { mimeType: 'image/jpeg', sizeBytes: 100 },
      'https://famstory.example',
    );

    await expect(
      service.receive(
        target.attachmentId,
        { expires: String(Math.floor(Date.now() / 1000) + 600), signature: 'nonsense' },
        Readable.from(Buffer.from('x')),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('puts the bytes where the row says they go', async () => {
    const { service, storage, rows } = build();
    const bytes = await photograph(400, 300);

    const { attachmentId } = await upload(service, bytes);

    const key = rows.get(attachmentId)?.storageKey as string;
    expect(await storage.sizeOf(key)).toBe(bytes.length);
  });

  it('refuses a second upload over the same attachment', async () => {
    const { service, rows } = build();
    const bytes = await photograph(200, 200);
    const target = await upload(service, bytes);

    // The first upload has not been completed, but the bytes are there. A
    // valid link must not become a way to swap a photograph afterwards.
    rows.set(target.attachmentId, { ...rows.get(target.attachmentId), uploadedAt: new Date() });

    const query = Object.fromEntries(new URL(target.uploadUrl).searchParams);
    await expect(
      service.receive(target.attachmentId, query, Readable.from(bytes)),
    ).rejects.toMatchObject({ response: { code: 'already_uploaded' } });
  });
});

describe('Finishing', () => {
  it('makes a thumbnail and marks the attachment real', async () => {
    const { service, storage, rows } = build();
    const bytes = await photograph(1600, 1200);
    const { attachmentId } = await upload(service, bytes);

    await service.complete(ctx(), attachmentId);
    const row = rows.get(attachmentId) as Record<string, unknown>;

    expect(row.uploadedAt).toBeInstanceOf(Date);
    expect(row.width).toBe(1600);
    expect(row.height).toBe(1200);

    const thumbnail = await storage.readBuffer(row.thumbnailKey as string);
    const meta = await sharp(thumbnail).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(480);
    // The point of a thumbnail: the timeline does not download the original.
    expect(thumbnail.length).toBeLessThan(bytes.length);
  });

  it('does not enlarge a photograph smaller than the thumbnail', async () => {
    const { service, storage, rows } = build();
    const { attachmentId } = await upload(service, await photograph(120, 90));

    await service.complete(ctx(), attachmentId);

    const meta = await sharp(
      await storage.readBuffer(rows.get(attachmentId)?.thumbnailKey as string),
    ).metadata();
    expect(meta.width).toBe(120);
  });

  it('completes without a thumbnail rather than failing on a format it cannot read', async () => {
    const { service, rows } = build();
    // Bytes that are not an image at all: the original is stored, the browser
    // may still be able to draw it, and a family should not lose an upload to
    // a missing codec on the server.
    const { attachmentId } = await upload(service, Buffer.from('not an image'), 'image/heic');

    await service.complete(ctx(), attachmentId);
    const row = rows.get(attachmentId) as Record<string, unknown>;

    expect(row.uploadedAt).toBeInstanceOf(Date);
    expect(row.thumbnailKey).toBeNull();
  });

  it('says so when the bytes never arrived', async () => {
    const { service } = build();
    const target = await service.requestUpload(
      ctx(),
      'evt1',
      { mimeType: 'image/jpeg', sizeBytes: 100 },
      'https://famstory.example',
    );

    await expect(service.complete(ctx(), target.attachmentId)).rejects.toMatchObject({
      response: { code: 'upload_incomplete' },
    });
  });
});

describe('Sweeping up', () => {
  it('removes rows whose bytes never came, and their files', async () => {
    const { service, storage, rows } = build();
    const { attachmentId } = await upload(service, await photograph(200, 200));
    const key = rows.get(attachmentId)?.storageKey as string;

    // Older than the sweep's window, and never completed.
    rows.set(attachmentId, { ...rows.get(attachmentId), createdAt: new Date(2020, 0, 1) });

    expect(await service.sweepAbandoned(60)).toBe(1);
    expect(rows.has(attachmentId)).toBe(false);
    expect(await storage.sizeOf(key)).toBeNull();
  });
});

describe('Voice notes', () => {
  /** Not a real recording: nothing on the server decodes one. */
  const recording = Buffer.from('OggS - pretend opus frames');

  it("takes what a browser records, parameters and all, and keeps the base type", async () => {
    const { service, rows } = build();

    const target = await service.requestUpload(
      ctx(),
      'evt1',
      { mimeType: 'audio/webm;codecs=opus', sizeBytes: recording.length, durationSec: 83.6 },
      'https://famstory.example',
    );

    expect(rows.get(target.attachmentId)).toMatchObject({
      kind: 'audio',
      mimeType: 'audio/webm',
      durationSec: 84,
    });
    expect(rows.get(target.attachmentId)?.storageKey).toMatch(/\.webm$/);
    expect(target.maxBytes).toBe(MAX_AUDIO_BYTES);
  });

  it('a photograph has no duration, whatever the client sends', async () => {
    const { service, rows } = build();
    const target = await service.requestUpload(
      ctx(),
      'evt1',
      { mimeType: 'image/jpeg', sizeBytes: 100, durationSec: 30 },
      'https://x',
    );
    expect(rows.get(target.attachmentId)?.durationSec).toBeNull();
  });

  it('refuses a recording far longer than a voice note', async () => {
    const { service } = build();
    await expect(
      service.requestUpload(
        ctx(),
        'evt1',
        { mimeType: 'audio/mp4', sizeBytes: MAX_AUDIO_BYTES + 1 },
        'https://x',
      ),
    ).rejects.toMatchObject({ response: { code: 'file_too_large', limit: MAX_AUDIO_BYTES } });
  });

  it('are counted apart from the photographs', async () => {
    // The event's three photographs are all the free plan allows...
    const { service } = build({ attachments: 3 });
    await expect(
      service.requestUpload(ctx(), 'evt1', { mimeType: 'audio/ogg', sizeBytes: 100 }, 'https://x'),
    ).resolves.toMatchObject({ method: 'PUT' });

    // ...and two voice notes are all it allows of those.
    const full = build({ voiceNotes: 2 });
    await expect(
      full.service.requestUpload(ctx(), 'evt1', { mimeType: 'audio/ogg', sizeBytes: 100 }, 'https://x'),
    ).rejects.toMatchObject({ response: { code: 'plan_limit_reached', limit: 2 } });
  });

  it('completes without trying to make a thumbnail', async () => {
    const { service, rows } = build();
    const target = await upload(service, recording, 'audio/webm');

    await service.complete(ctx(), target.attachmentId);

    const row = rows.get(target.attachmentId);
    expect(row?.uploadedAt).toBeInstanceOf(Date);
    expect(row?.thumbnailKey ?? null).toBeNull();
  });
});

describe('Taking one out', () => {
  it('removes the row and the file, and says so in the audit log', async () => {
    const { service, storage, rows, audit } = build();
    const target = await upload(service, await photograph(400, 300));
    await service.complete(ctx(), target.attachmentId);
    const key = rows.get(target.attachmentId)?.storageKey as string;

    await service.remove(ctx(), target.attachmentId);

    expect(rows.has(target.attachmentId)).toBe(false);
    expect(await storage.sizeOf(key)).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'attachment.deleted', entityId: target.attachmentId }),
    );
  });

  it('refuses an event this person cannot see, as if it were not there', async () => {
    const { service } = build();
    const target = await upload(service, recording(), 'audio/webm');

    const hidden = build({ eventVisible: false });
    hidden.rows.set(target.attachmentId, { id: target.attachmentId, eventId: 'evt1', storageKey: '' });
    await expect(hidden.service.remove(ctx(), target.attachmentId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("a member may not take out somebody else's", async () => {
    const { service } = build({ author: 'memvera' });
    const target = await upload(service, recording(), 'audio/webm');

    await expect(
      service.remove(ctx({ memberId: 'memmartin', role: MemberRole.member }), target.attachmentId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  function recording(): Buffer {
    return Buffer.from('pretend opus');
  }
});
