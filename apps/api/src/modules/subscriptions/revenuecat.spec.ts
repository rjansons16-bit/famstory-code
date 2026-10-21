import { effectivePlan, isPremium } from './premium';
import { familyIdsInWebhook, periodOf, stateFromSubscriber, type RcSubscriber } from './revenuecat';

const NOW = new Date('2026-10-08T12:00:00Z');
const FAMILY = 'cmg1abcdefghijklmnopqrstu';

function subscriber(over: {
  expires?: string | null;
  grace?: string | null;
  product?: string;
  billing?: string | null;
  unsubscribed?: string | null;
  sandbox?: boolean;
  store?: string;
}): RcSubscriber {
  const product = over.product ?? 'famstory.premium.monthly';
  return {
    entitlements: {
      premium: {
        expires_date: over.expires === undefined ? '2026-11-08T12:00:00Z' : over.expires,
        grace_period_expires_date: over.grace ?? null,
        product_identifier: product,
      },
    },
    subscriptions: {
      [product]: {
        billing_issues_detected_at: over.billing ?? null,
        unsubscribe_detected_at: over.unsubscribed ?? null,
        is_sandbox: over.sandbox ?? false,
        store: over.store ?? 'app_store',
      },
    },
  };
}

describe('What RevenueCat says, as a row', () => {
  it('nothing for a family that never bought Premium', () => {
    expect(stateFromSubscriber({}, NOW)).toBeNull();
    expect(stateFromSubscriber({ entitlements: {}, subscriptions: {} }, NOW)).toBeNull();
  });

  it('a monthly subscription that runs', () => {
    expect(stateFromSubscriber(subscriber({}), NOW)).toEqual({
      plan: 'premium',
      status: 'active',
      period: 'monthly',
      currentPeriodEnd: new Date('2026-11-08T12:00:00Z'),
      cancelAtPeriodEnd: false,
      store: 'app_store',
      sandbox: false,
    });
  });

  it('renewal turned off: Premium until the end, then not', () => {
    const state = stateFromSubscriber(subscriber({ unsubscribed: '2026-10-01T00:00:00Z' }), NOW);
    expect(state).toMatchObject({ plan: 'premium', status: 'active', cancelAtPeriodEnd: true });
  });

  it('an ended subscription is the free plan', () => {
    const state = stateFromSubscriber(subscriber({ expires: '2026-10-01T00:00:00Z' }), NOW);
    expect(state).toMatchObject({ plan: 'free', status: 'expired' });
  });

  it('a failed payment inside the grace period is still Premium, until the grace ends', () => {
    const inGrace = stateFromSubscriber(
      subscriber({
        expires: '2026-10-07T00:00:00Z',
        grace: '2026-10-20T00:00:00Z',
        billing: '2026-10-07T00:00:00Z',
      }),
      NOW,
    );
    expect(inGrace).toMatchObject({
      plan: 'premium',
      status: 'past_due',
      currentPeriodEnd: new Date('2026-10-20T00:00:00Z'),
    });

    const after = stateFromSubscriber(
      subscriber({ expires: '2026-10-01T00:00:00Z', grace: '2026-10-05T00:00:00Z', billing: '2026-10-01T00:00:00Z' }),
      NOW,
    );
    expect(after).toMatchObject({ plan: 'free', status: 'expired' });
  });

  it('a grant without an end (RevenueCat promotional, lifetime) has no end date', () => {
    const state = stateFromSubscriber(subscriber({ expires: null, store: 'promotional' }), NOW);
    expect(state).toMatchObject({ plan: 'premium', status: 'active', currentPeriodEnd: null, store: 'promotional' });
  });

  it('Google Play names a base plan after a colon', () => {
    const state = stateFromSubscriber(subscriber({ product: 'famstory.premium:annual', store: 'play_store' }), NOW);
    expect(state).toMatchObject({ period: 'annual', store: 'play_store' });
  });

  it('a sandbox purchase (TestFlight, App Review) unlocks Premium and says it is a test', () => {
    expect(stateFromSubscriber(subscriber({ sandbox: true }), NOW)).toMatchObject({ plan: 'premium', sandbox: true });
  });
});

describe('The period, from the product name', () => {
  it.each([
    ['famstory.premium.monthly', 'monthly'],
    ['famstory.premium.annual', 'annual'],
    ['famstory.premium:monthly', 'monthly'],
    ['famstory_premium_yearly', 'annual'],
    ['famstory.premium', null],
  ])('%s', (name, period) => {
    expect(periodOf(name)).toBe(period);
  });
});

describe('Whom a webhook is about', () => {
  it('the app user id, its aliases, and both sides of a transfer', () => {
    const other = 'cmg2abcdefghijklmnopqrstu';
    const third = 'cmg3abcdefghijklmnopqrstu';
    const ids = familyIdsInWebhook({
      event: {
        type: 'TRANSFER',
        app_user_id: FAMILY,
        aliases: [FAMILY, '$RCAnonymousID:8f1c2e'],
        transferred_from: [other],
        transferred_to: [third],
      },
    });
    expect(ids.sort()).toEqual([FAMILY, other, third].sort());
  });

  it('nothing from a body that is not an event', () => {
    expect(familyIdsInWebhook(null)).toEqual([]);
    expect(familyIdsInWebhook({})).toEqual([]);
    expect(familyIdsInWebhook({ event: 'x' })).toEqual([]);
    expect(familyIdsInWebhook({ event: { app_user_id: "'; DROP TABLE" } })).toEqual([]);
  });
});

describe('Whether a family has Premium now', () => {
  const row = (over: Partial<{ plan: 'free' | 'premium'; status: 'active' | 'past_due' | 'cancelled' | 'expired'; end: Date | null }>) => ({
    plan: over.plan ?? 'premium',
    status: over.status ?? 'active',
    currentPeriodEnd: over.end === undefined ? new Date(NOW.getTime() + 86_400_000) : over.end,
  });

  it('a paid period that has not ended', () => {
    expect(isPremium(row({}), NOW)).toBe(true);
    expect(isPremium(row({ status: 'past_due' }), NOW)).toBe(true);
  });

  it('a plan set by hand, with no end', () => {
    expect(isPremium(row({ end: null }), NOW)).toBe(true);
  });

  it('not after the end, whatever the status says', () => {
    expect(isPremium(row({ end: new Date(NOW.getTime() - 1) }), NOW)).toBe(false);
  });

  it('not when the store says it ended, nor without a row', () => {
    expect(isPremium(row({ status: 'expired' }), NOW)).toBe(false);
    expect(isPremium(row({ status: 'cancelled' }), NOW)).toBe(false);
    expect(isPremium(row({ plan: 'free' }), NOW)).toBe(false);
    expect(effectivePlan(null, NOW)).toBe('free');
  });
});
