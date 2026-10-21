import { UnauthorizedException } from '@nestjs/common';

import type { PrismaService } from '../../common/prisma.service';
import type { RcSubscriber, RevenueCatClient } from './revenuecat';
import { SubscriptionsService } from './subscriptions.service';

const NOW = new Date('2026-10-08T12:00:00Z');
const FAMILY = 'cmg1abcdefghijklmnopqrstu';
const SECRET = 'Bearer webhook-secret-value';

const PREMIUM: RcSubscriber = {
  entitlements: {
    premium: { expires_date: '2026-11-08T12:00:00Z', product_identifier: 'famstory.premium.annual' },
  },
  subscriptions: { 'famstory.premium.annual': { store: 'app_store', is_sandbox: false } },
};

function build(options: { subscriber?: RcSubscriber; existing?: Record<string, unknown> | null; families?: string[] } = {}) {
  const rows = new Map<string, Record<string, unknown>>();
  if (options.existing) rows.set(FAMILY, { familyId: FAMILY, ...options.existing });

  const prisma = {
    subscription: {
      findUnique: jest.fn(async ({ where }: { where: { familyId: string } }) => rows.get(where.familyId) ?? null),
      upsert: jest.fn(async ({ where, create, update }) => {
        const row = rows.has(where.familyId) ? { ...rows.get(where.familyId), ...update } : create;
        rows.set(where.familyId, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = { ...rows.get(where.familyId), ...data };
        rows.set(where.familyId, row);
        return row;
      }),
    },
    family: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.filter((id) => (options.families ?? [FAMILY]).includes(id)).map((id) => ({ id })),
      ),
    },
  } as unknown as PrismaService;

  const revenueCat = {
    subscriber: jest.fn(async () => options.subscriber ?? {}),
    webhookAuthorization: SECRET,
    configured: true,
  } as unknown as RevenueCatClient;

  return { service: new SubscriptionsService(prisma, revenueCat), prisma, revenueCat, rows };
}

describe('Reading a family plan from RevenueCat', () => {
  it('a purchase becomes the family row', async () => {
    const { service, rows } = build({ subscriber: PREMIUM });
    const plan = await service.sync(FAMILY, NOW);

    expect(plan).toMatchObject({ plan: 'premium', status: 'active', period: 'annual', store: 'app_store' });
    expect(rows.get(FAMILY)).toMatchObject({ plan: 'premium', syncedAt: NOW, sandbox: false });
  });

  it('nothing in RevenueCat and no row: nothing is written', async () => {
    const { service, prisma } = build();
    expect(await service.sync(FAMILY, NOW)).toMatchObject({ plan: 'free', status: null });
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('a plan set by hand is left alone when RevenueCat has nothing', async () => {
    const { service, prisma } = build({
      existing: { plan: 'premium', status: 'active', currentPeriodEnd: null, store: null },
    });
    expect(await service.sync(FAMILY, NOW)).toMatchObject({ plan: 'premium' });
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('a purchase that moved to another family ends here', async () => {
    const { service, rows } = build({
      existing: {
        plan: 'premium',
        status: 'active',
        currentPeriodEnd: new Date('2026-12-01T00:00:00Z'),
        store: 'app_store',
      },
    });
    expect(await service.sync(FAMILY, NOW)).toMatchObject({ plan: 'free', status: 'expired' });
    expect(rows.get(FAMILY)).toMatchObject({ plan: 'free', status: 'expired' });
  });
});

describe("RevenueCat's webhook", () => {
  const body = { event: { type: 'RENEWAL', app_user_id: FAMILY } };

  it('refuses a call without the shared value', async () => {
    const { service, revenueCat } = build({ subscriber: PREMIUM });
    await expect(service.webhook(undefined, body)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.webhook('Bearer wrong', body)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(revenueCat.subscriber).not.toHaveBeenCalled();
  });

  it('refuses everything when the server has no shared value set', async () => {
    const { service, revenueCat } = build({ subscriber: PREMIUM });
    (revenueCat as unknown as { webhookAuthorization: string }).webhookAuthorization = '';
    await expect(service.webhook('', body)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reads the family again - from RevenueCat, not from the body', async () => {
    const { service, revenueCat, rows } = build({ subscriber: PREMIUM });
    await expect(service.webhook(SECRET, body)).resolves.toEqual({ synced: 1 });
    expect(revenueCat.subscriber).toHaveBeenCalledWith(FAMILY);
    expect(rows.get(FAMILY)).toMatchObject({ plan: 'premium' });
  });

  it("ignores ids that are not this server's families (RevenueCat's test event)", async () => {
    const { service, revenueCat } = build({ families: [] });
    await expect(service.webhook(SECRET, { event: { type: 'TEST', app_user_id: 'cmgzzzzzzzzzzzzzzzzzzzzzz' } })).resolves.toEqual({ synced: 0 });
    expect(revenueCat.subscriber).not.toHaveBeenCalled();
  });
});
