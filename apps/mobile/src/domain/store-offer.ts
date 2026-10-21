/**
 * WHAT THE PAYWALL SHOWS FOR A STORE'S PRODUCT.
 *
 * App Review guideline 3.1.2 asks the screen that sells a subscription to say
 * the price, the length of each period, and - when there is one - what an
 * introductory offer is and what follows it. All of it comes from the store
 * (`priceString` is already in the buyer's currency and language), never from
 * domain/plans.ts, which is the sample family's price only.
 *
 * Kept apart from lib/purchases.ts so it can be tested without the store's SDK.
 */

export type PeriodUnit = 'day' | 'week' | 'month' | 'year';

export interface IntroOffer {
  /** A free trial, or a lower price for the first periods. */
  free: boolean;
  price: string;
  unit: PeriodUnit;
  count: number;
  /** How many periods of `count` x `unit` the offer lasts. */
  cycles: number;
}

export interface StoreOption {
  /** The store package's id - what `buy` is given back. */
  id: string;
  period: 'monthly' | 'annual';
  /** The store's own string: "4,49 €", "$4.99". */
  price: string;
  /** For the yearly option, what it comes to a month. */
  perMonth: string | null;
  intro: IntroOffer | null;
}

export interface StoreOffer {
  monthly: StoreOption | null;
  annual: StoreOption | null;
}

/** The parts of RevenueCat's `PurchasesStoreProduct` read here. */
export interface StoreProduct {
  priceString: string;
  pricePerMonthString?: string | null;
  introPrice?: {
    price: number;
    priceString: string;
    cycles: number;
    periodUnit: string;
    periodNumberOfUnits: number;
  } | null;
}

const UNITS: Record<string, PeriodUnit> = { DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year' };

export function optionFrom(id: string, period: 'monthly' | 'annual', product: StoreProduct): StoreOption {
  const intro = product.introPrice;
  const unit = intro ? UNITS[intro.periodUnit.toUpperCase()] : undefined;
  return {
    id,
    period,
    price: product.priceString,
    perMonth: period === 'annual' ? (product.pricePerMonthString ?? null) : null,
    intro:
      intro && unit && intro.periodNumberOfUnits > 0
        ? {
            free: intro.price === 0,
            price: intro.priceString,
            unit,
            count: intro.periodNumberOfUnits,
            cycles: Math.max(1, intro.cycles),
          }
        : null,
  };
}
