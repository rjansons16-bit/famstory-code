import { MemberRole } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';

import type { AuditService } from '../../common/audit.service';
import type { PrismaService } from '../../common/prisma.service';
import { SigningService } from '../../common/signing.service';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';
import { CalendarService } from './calendar.service';

/**
 * The address is the permission, so the tests are about who it stops working
 * for: a forged or old address, a member who has left, died or gone.
 */

const ORIGIN = 'http://192.168.1.10:8081';

function member(patch: Record<string, unknown> = {}) {
  return {
    id: 'mem_vera',
    familyId: 'fam_1',
    role: MemberRole.viewer,
    status: 'active',
    diedOn: null,
    userId: 'usr_vera',
    groupLinks: [{ groupId: 'grp_grandparents' }],
    family: { name: 'The Bergs', deletedAt: null },
    user: { deletedAt: null, locale: 'lv' },
    ...patch,
  };
}

function build(options: { version?: number; member?: Record<string, unknown> } = {}) {
  const prisma = {
    calendarFeed: {
      findUnique: jest.fn().mockImplementation(({ select }: { select?: unknown }) =>
        Promise.resolve(
          select
            ? { version: options.version ?? 1, lastFetchedAt: null, member: member(options.member) }
            : null,
        ),
      ),
      create: jest.fn().mockResolvedValue({ version: 1, createdAt: new Date(), lastFetchedAt: null }),
      upsert: jest.fn().mockResolvedValue({ version: 2, createdAt: new Date(), lastFetchedAt: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    event: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'evt_1',
          title: 'Sunday lunch',
          description: null,
          startsAt: new Date('2026-10-04T10:00:00Z'),
          endsAt: null,
          allDay: false,
          repeat: null,
          repeatUntil: null,
          repeatSkips: [],
          repeatTimeZone: null,
          updatedAt: new Date('2026-10-01T10:00:00Z'),
        },
      ]),
    },
    member: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'mem_anna', displayName: 'Anna', birthDate: new Date('1985-06-01T09:00:00Z') },
      ]),
    },
  };

  const config = { get: (key: string) => (key === 'JWT_SECRET' ? 'test-secret' : undefined) };
  const signing = new SigningService(config as unknown as ConfigService);
  const visibility = new VisibilityService(prisma as unknown as PrismaService);
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new CalendarService(
    prisma as unknown as PrismaService,
    visibility,
    signing,
    audit as unknown as AuditService,
  );
  return { service, prisma, signing, audit };
}

const ctx: ViewerContext = {
  memberId: 'mem_vera',
  familyId: 'fam_1',
  role: MemberRole.viewer,
  groupIds: ['grp_grandparents'],
};

/** The file name part of a feed address. */
const fileOf = (url: string) => url.split('/v1/calendar/')[1];

describe('The feed address', () => {
  it('is made once, on the address the app used, with a webcal twin', async () => {
    const { service, audit } = build();
    const feed = await service.feedFor(ctx, ORIGIN);

    expect(feed.url.startsWith(`${ORIGIN}/v1/calendar/mem_vera.1.`)).toBe(true);
    expect(feed.url.endsWith('.ics')).toBe(true);
    expect(feed.webcalUrl.startsWith('webcal://192.168.1.10:8081/')).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'calendar_feed.created' }));
  });

  it('a reset moves to the next version', async () => {
    const { service } = build();
    const feed = await service.reset(ctx, ORIGIN);
    expect(fileOf(feed.url).startsWith('mem_vera.2.')).toBe(true);
  });
});

describe('Reading the feed', () => {
  async function addressFor(version = 1) {
    const { signing } = build();
    const payload = `mem_vera.${version}`;
    return `${payload}.${signing.sign('calendar', payload)}.ics`;
  }

  it('answers with the events and birthdays that member can see', async () => {
    const { service, prisma } = build();
    const text = await service.render(await addressFor());

    expect(text).toContain('SUMMARY:Sunday lunch');
    expect(text).toContain('SUMMARY:Dzimšanas diena: Anna');
    // Through the timeline's own filter, not a query of its own.
    const where = prisma.event.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where.AND[0])).toContain('mem_vera');
  });

  it('refuses an address whose signature was altered', async () => {
    const { service } = build();
    const address = (await addressFor()).replace(/\.[a-f0-9]{64}\.ics$/, `.${'0'.repeat(64)}.ics`);
    await expect(service.render(address)).resolves.toBeNull();
  });

  it('refuses the old address once it has been reset', async () => {
    const { service } = build({ version: 2 });
    await expect(service.render(await addressFor(1))).resolves.toBeNull();
  });

  it('refuses anything that is not shaped like one', async () => {
    const { service } = build();
    await expect(service.render('../../etc/passwd')).resolves.toBeNull();
  });

  it.each([
    ['who has left the family', { status: 'removed' }],
    ['the family has marked as having died', { diedOn: new Date('2026-01-01') }],
    ['whose account is being deleted', { user: { deletedAt: new Date(), locale: 'lv' } }],
    ['whose family is closed', { family: { name: 'X', deletedAt: new Date() } }],
  ])('reads nothing for a member %s', async (_label, patch) => {
    const { service } = build({ member: patch });
    await expect(service.render(await addressFor())).resolves.toBeNull();
  });
});
