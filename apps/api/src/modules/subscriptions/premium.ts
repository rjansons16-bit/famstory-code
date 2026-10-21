import type { SubscriptionStatus } from '@prisma/client';

/**
 * WHETHER A FAMILY HAS PREMIUM, NOW.
 *
 * One answer for every limit the server enforces (events.service.ts,
 * uploads.service.ts) and for what the family's reply tells the app. It used
 * to be `plan === 'premium' && status === 'active'` in two places, which was
 * right while nothing could end a subscription. A store subscription ends on
 * a date, and the webhook that says so can arrive late or not at all - so the
 * date is checked here, not only the status.
 *
 * - `past_due` is still Premium: the store is retrying the payment inside a
 *   grace period, and `currentPeriodEnd` is the end of that grace.
 * - No end date is a plan without an end: one an operator set by hand.
 */
export interface PlanRow {
  plan: 'free' | 'premium';
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
}

const STILL_PAID: readonly SubscriptionStatus[] = ['active', 'past_due'];

export function isPremium(row: PlanRow | null | undefined, now: Date = new Date()): boolean {
  if (!row || row.plan !== 'premium') return false;
  if (!STILL_PAID.includes(row.status)) return false;
  return !row.currentPeriodEnd || row.currentPeriodEnd.getTime() > now.getTime();
}

export function effectivePlan(row: PlanRow | null | undefined, now: Date = new Date()): 'free' | 'premium' {
  return isPremium(row, now) ? 'premium' : 'free';
}

/** What a limit check needs from the row, and nothing else. */
export const PLAN_SELECT = { plan: true, status: true, currentPeriodEnd: true } as const;
