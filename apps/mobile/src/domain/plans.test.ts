import assert from 'node:assert/strict';

import { useLocale } from '@/data/locale';
import {
  PLAN_LIMITS,
  PRICING,
  formatPrice,
  isUnlimited,
  isWithinLimit,
  limitPressure,
  limitsFor,
} from './plans';

/**
 * Plan and limit tests.
 *
 * The study monetisation rule: Premium should activate once the user has
 * already accumulated value. That means the limits have to be REACHABLE, not
 * blocking — and this checks that in numbers rather than in words.
 */

describe('Plan limits', () => {
  it('the free plan allows enough to understand the product value', () => {
    const free = limitsFor('free');
    // The study KPI is 5-10 events a month. 50 events is about six months of
    // use before the user hits a wall.
    assert.ok(free.maxEvents >= 50, 'too few events to accumulate value');
    assert.ok(free.maxMembers >= 4, 'a family needs room for at least four');
  });

  it('premium removes the event limit', () => {
    assert.equal(isUnlimited(limitsFor('premium').maxEvents), true);
  });

  it('premium is at least as generous as free on every numeric limit', () => {
    const free = PLAN_LIMITS.free;
    const premium = PLAN_LIMITS.premium;
    const numeric = [
      'maxEvents',
      'maxAttachmentsPerEvent',
      'maxMembers',
      'maxCustomGroups',
      'maxRemindersPerEvent',
    ] as const;

    for (const key of numeric) {
      const better = isUnlimited(premium[key]) || premium[key] >= free[key];
      assert.ok(better, `premium.${key} is not better than free`);
    }
  });

  it('premium turns on every feature flag that free withholds', () => {
    const flags = ['canExport', 'canSummarize', 'canUploadVideo'] as const;
    for (const flag of flags) {
      assert.equal(PLAN_LIMITS.free[flag], false, `free.${flag} must not be on`);
      assert.equal(PLAN_LIMITS.premium[flag], true, `premium.${flag} must be on`);
    }
  });
});

describe('isWithinLimit', () => {
  it('below the limit — allowed', () => {
    assert.equal(isWithinLimit(49, 50), true);
  });

  it('exactly at the limit — no longer allowed', () => {
    assert.equal(isWithinLimit(50, 50), false);
  });

  it('above the limit — not allowed', () => {
    assert.equal(isWithinLimit(51, 50), false);
  });

  it('an unlimited limit always allows', () => {
    assert.equal(isWithinLimit(10_000, -1), true);
  });
});

describe('limitPressure — when the paywall warns', () => {
  it('an empty account creates no pressure', () => {
    assert.equal(limitPressure(0, 50), 0);
  });

  it('half the limit is 0.5', () => {
    assert.equal(limitPressure(25, 50), 0.5);
  });

  it('the soft warning (0.8) kicks in at 40 of 50', () => {
    assert.ok(limitPressure(40, 50) >= 0.8);
    assert.ok(limitPressure(39, 50) < 0.8);
  });

  it('never exceeds 1, even when the limit is already passed', () => {
    assert.equal(limitPressure(500, 50), 1);
  });

  it('an unlimited plan has no pressure', () => {
    assert.equal(limitPressure(10_000, -1), 0);
  });

  it('a zero limit is full pressure, not a division by zero', () => {
    assert.equal(limitPressure(0, 0), 1);
  });
});

describe('Pricing', () => {
  it('matches the study plan: EUR 4.50 a month and EUR 45 a year', () => {
    assert.equal(PRICING.monthly.amount, 4.5);
    assert.equal(PRICING.annual.amount, 45);
    assert.equal(PRICING.monthly.currency, 'EUR');
  });

  it('the yearly plan really is cheaper than twelve months', () => {
    assert.ok(PRICING.annual.amount < PRICING.monthly.amount * 12);
  });

  it('the saving percentage is computed, not hand-written', () => {
    const expected = Math.round((1 - 45 / (4.5 * 12)) * 100);
    assert.equal(PRICING.annualSavingPercent, expected);
    assert.equal(PRICING.annualSavingPercent, 17);
  });
});

describe('Prices', () => {
  afterEach(() => useLocale.setState({ locale: 'en' }));

  it('are written the way the rest of the English interface is', () => {
    assert.equal(formatPrice(PRICING.monthly.amount, 'EUR'), '€4.50');
    assert.equal(formatPrice(PRICING.annual.amount, 'EUR'), '€45.00');
  });

  it('are written the Latvian way in Latvian, as the dates are', () => {
    useLocale.setState({ locale: 'lv' });
    // A decimal comma, and the symbol after behind a no-break space.
    assert.equal(formatPrice(PRICING.monthly.amount, 'EUR'), '4,50\u00a0€');
    assert.equal(formatPrice(PRICING.annual.amount, 'EUR'), '45,00\u00a0€');
  });

  it('never drop a currency on the floor', () => {
    // An unknown currency has to stay legible rather than print a bare number.
    assert.equal(formatPrice(9, 'USD'), 'USD 9.00');
    useLocale.setState({ locale: 'lv' });
    assert.equal(formatPrice(9, 'USD'), '9,00\u00a0USD');
  });
});
