/**
 * Free / Premium limits and paywall logic.
 *
 * The feasibility study's monetisation rule:
 *   "Premium should activate at the moment the user has already accumulated
 *    value: events, photos, comments and family members."
 *
 * So the limits are REACHABLE, not blocking. A free user has to understand the
 * product's value before they hit a wall.
 */

import { currentLocale } from '@/data/locale';

export type PlanId = 'free' | 'premium';

export interface PlanLimits {
  /** Total events in the family. -1 = unlimited. */
  maxEvents: number;
  /** Images/videos per event. */
  maxAttachmentsPerEvent: number;
  /**
   * Voice notes per event, counted apart from the photographs - the story of
   * a day does not use up the room for its pictures. Mirrors the server
   * (apps/api/src/modules/media/uploads.service.ts).
   */
  maxVoiceNotesPerEvent: number;
  /** Active family members. */
  maxMembers: number;
  /** Custom groups (on top of the system ones). */
  maxCustomGroups: number;
  /** Reminders per event. */
  maxRemindersPerEvent: number;
  /**
   * The DESIGNED chronicle - a PDF, a photo book.
   *
   * Not the data export in Settings: a machine-readable copy of your own data
   * is a right (GDPR Art. 15 and 20) and is free on every plan. Selling that
   * back to its owner is the thing docs/06-PRIVACY-GDPR.md forbids by name.
   */
  canExport: boolean;
  /** Monthly / yearly summaries. */
  canSummarize: boolean;
  /** Video attachments. */
  canUploadVideo: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    maxEvents: 50,
    maxAttachmentsPerEvent: 3,
    maxVoiceNotesPerEvent: 2,
    maxMembers: 5,
    maxCustomGroups: 1,
    maxRemindersPerEvent: 1,
    canExport: false,
    canSummarize: false,
    canUploadVideo: false,
  },
  premium: {
    maxEvents: -1,
    maxAttachmentsPerEvent: 20,
    maxVoiceNotesPerEvent: 10,
    maxMembers: 25,
    maxCustomGroups: 15,
    maxRemindersPerEvent: 3,
    canExport: true,
    canSummarize: true,
    canUploadVideo: true,
  },
};

export const PRICING = {
  monthly: { amount: 4.5, currency: 'EUR', period: 'month' as const },
  annual: { amount: 45, currency: 'EUR', period: 'year' as const },
  /** Yearly saving in percent, shown on the paywall. */
  annualSavingPercent: Math.round((1 - 45 / (4.5 * 12)) * 100), // 17
};

const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€' };

/**
 * A price, written the way the rest of the app writes things in the language
 * it is speaking: `€4.50` in English, `4,50 €` in Latvian - a decimal comma
 * and the symbol after, held to the number by a no-break space. Money and
 * dates have to agree, and dates follow the language (`lib/date.ts`).
 *
 * Deliberately not `Intl.NumberFormat`: its output depends on the ICU data the
 * engine happens to carry, so a test could pass in Node and the device could
 * still print something else.
 */
export function formatPrice(amount: number, currency: string = PRICING.monthly.currency): string {
  const symbol = CURRENCY_SYMBOL[currency];
  const digits = amount.toFixed(2);
  if (currentLocale() === 'lv') return `${digits.replace('.', ',')}\u00a0${symbol ?? currency}`;
  return symbol ? `${symbol}${digits}` : `${currency} ${digits}`;
}

export function limitsFor(plan: PlanId): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function isUnlimited(value: number): boolean {
  return value === -1;
}

export function isWithinLimit(current: number, limit: number): boolean {
  return isUnlimited(limit) || current < limit;
}

/**
 * How close to the limit we are (0..1). The soft warning appears at 0.8.
 * The hard block only at 1.0.
 */
export function limitPressure(current: number, limit: number): number {
  if (isUnlimited(limit)) return 0;
  if (limit <= 0) return 1;
  return Math.min(1, current / limit);
}

export type PaywallTrigger =
  | 'events_limit'
  | 'attachments_limit'
  | 'members_limit'
  | 'groups_limit'
  | 'video_upload'
  | 'export'
  | 'summary';

/**
 * The paywall may appear ONLY in response to something the user tried to do.
 * Never during onboarding, never as a pop-up out of nowhere.
 */
export interface PaywallContext {
  trigger: PaywallTrigger;
  /** What the user tried to do — keep the copy specific, not generic. */
  attemptedAction: string;
}
