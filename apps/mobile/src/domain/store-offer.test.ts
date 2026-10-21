import { toFamilyPlan } from '@/data/api';

import { optionFrom } from './store-offer';

describe("A store's product, as the paywall shows it", () => {
  it("keeps the store's own price string, in the buyer's currency", () => {
    expect(optionFrom('$rc_monthly', 'monthly', { priceString: '4,49 €' })).toEqual({
      id: '$rc_monthly',
      period: 'monthly',
      price: '4,49 €',
      perMonth: null,
      intro: null,
    });
  });

  it('the yearly option says what it comes to a month', () => {
    const option = optionFrom('$rc_annual', 'annual', { priceString: '44,99 €', pricePerMonthString: '3,75 €' });
    expect(option.perMonth).toBe('3,75 €');
  });

  it('a free trial: how long, so the screen can say what follows (App Review 3.1.2)', () => {
    const option = optionFrom('$rc_annual', 'annual', {
      priceString: '44,99 €',
      introPrice: { price: 0, priceString: '0,00 €', cycles: 1, periodUnit: 'WEEK', periodNumberOfUnits: 1 },
    });
    expect(option.intro).toEqual({ free: true, price: '0,00 €', unit: 'week', count: 1, cycles: 1 });
  });

  it('a lower price for the first months', () => {
    const option = optionFrom('$rc_monthly', 'monthly', {
      priceString: '4,49 €',
      introPrice: { price: 1.99, priceString: '1,99 €', cycles: 3, periodUnit: 'MONTH', periodNumberOfUnits: 1 },
    });
    expect(option.intro).toMatchObject({ free: false, price: '1,99 €', unit: 'month', count: 1, cycles: 3 });
  });

  it('an offer in a unit it does not know is left out rather than guessed', () => {
    const option = optionFrom('$rc_monthly', 'monthly', {
      priceString: '4,49 €',
      introPrice: { price: 0, priceString: '0', cycles: 1, periodUnit: 'FORTNIGHT', periodNumberOfUnits: 1 },
    });
    expect(option.intro).toBeNull();
  });
});

describe("The family's plan, from the server's reply", () => {
  it('Premium that renews', () => {
    expect(
      toFamilyPlan('premium', {
        plan: 'premium',
        status: 'active',
        period: 'annual',
        currentPeriodEnd: '2027-10-08T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        store: 'app_store',
      }),
    ).toEqual({
      plan: 'premium',
      subscription: { period: 'annual', until: '2027-10-08T00:00:00.000Z', renews: true, store: 'app_store' },
    });
  });

  it('Premium with renewal turned off runs to its end', () => {
    expect(
      toFamilyPlan('premium', {
        plan: 'premium',
        status: 'active',
        currentPeriodEnd: '2026-11-08T00:00:00.000Z',
        cancelAtPeriodEnd: true,
      }).subscription,
    ).toMatchObject({ renews: false, until: '2026-11-08T00:00:00.000Z' });
  });

  it('a plan set by hand has no end and does not renew', () => {
    expect(toFamilyPlan('premium', { plan: 'premium', status: 'active', currentPeriodEnd: null }).subscription).toEqual({
      renews: false,
    });
  });

  it("the server's plan wins over the row: an ended period is free", () => {
    expect(
      toFamilyPlan('free', { plan: 'premium', status: 'active', currentPeriodEnd: '2026-01-01T00:00:00.000Z' }),
    ).toEqual({ plan: 'free' });
  });

  it('an older server without `plan`: active premium is premium, anything else free', () => {
    expect(toFamilyPlan(undefined, { plan: 'premium', status: 'active' }).plan).toBe('premium');
    expect(toFamilyPlan(undefined, { plan: 'premium', status: 'expired' }).plan).toBe('free');
    expect(toFamilyPlan(undefined, null)).toEqual({ plan: 'free' });
  });
});
