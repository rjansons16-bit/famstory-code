import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BillingPeriod, PurchaseStore, SubscriptionStatus } from '@prisma/client';

/**
 * REVENUECAT: WHAT THE STORES SAY A FAMILY HAS PAID FOR.
 *
 * The App Store and Google Play sell Premium; RevenueCat checks their receipts
 * and follows renewals, grace periods, refunds and transfers
 * (docs/09-APP-STORES.md §3.2). The family's id is RevenueCat's "app user id",
 * so a purchase belongs to the family it was made in, and every member's app
 * sees it.
 *
 * The server never believes what a request says about a purchase - not the
 * app's, and not a webhook's body. Both only say "look again", and the looking
 * is a call from here to RevenueCat with the secret key. A forged webhook can
 * at most make the server read the truth once more.
 */

/** The entitlement configured in RevenueCat's dashboard (docs/12-LAUNCH-RUNBOOK.md). */
export const ENTITLEMENT = 'premium';

const API = 'https://api.revenuecat.com/v1';

/** The parts of RevenueCat's `GET /v1/subscribers/{id}` this server reads. */
export interface RcEntitlement {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  product_identifier: string;
  product_plan_identifier?: string | null;
}

export interface RcSubscription {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  billing_issues_detected_at?: string | null;
  unsubscribe_detected_at?: string | null;
  is_sandbox?: boolean;
  store?: string;
  product_plan_identifier?: string | null;
}

export interface RcSubscriber {
  entitlements?: Record<string, RcEntitlement | undefined>;
  subscriptions?: Record<string, RcSubscription | undefined>;
}

/** What the family's `Subscription` row becomes. */
export interface StoreState {
  plan: 'free' | 'premium';
  status: SubscriptionStatus;
  period: BillingPeriod | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  store: PurchaseStore;
  sandbox: boolean;
}

function date(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function later(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/**
 * The period from the product's name: `famstory.premium.annual` on the App
 * Store, `famstory.premium:annual` (product : base plan) on Google Play. Not
 * from the dates - the stores' sandboxes renew a month every five minutes.
 */
export function periodOf(...names: (string | null | undefined)[]): BillingPeriod | null {
  const name = names.filter(Boolean).join(':').toLowerCase();
  if (/annual|year|p1y/.test(name)) return 'annual';
  if (/month|p1m/.test(name)) return 'monthly';
  return null;
}

function storeOf(value: string | undefined): PurchaseStore {
  if (value === 'app_store' || value === 'mac_app_store') return 'app_store';
  if (value === 'play_store') return 'play_store';
  if (value === 'promotional') return 'promotional';
  return 'other';
}

/**
 * RevenueCat's answer, as a row. `null`: RevenueCat has never seen Premium for
 * this family - no purchase, or one that moved to another family.
 */
export function stateFromSubscriber(subscriber: RcSubscriber, now: Date = new Date()): StoreState | null {
  const entitlement = subscriber.entitlements?.[ENTITLEMENT];
  if (!entitlement) return null;

  const product = entitlement.product_identifier;
  const subscription =
    subscriber.subscriptions?.[product] ?? subscriber.subscriptions?.[product.split(':')[0] ?? product];

  // A lifetime grant has no end. A subscription ends at its expiry, or at the
  // end of the grace period while the store retries a failed payment.
  const expires = date(entitlement.expires_date);
  const grace = later(date(entitlement.grace_period_expires_date), date(subscription?.grace_period_expires_date));
  const end = entitlement.expires_date === null ? null : later(expires, grace);
  const active = end === null || end.getTime() > now.getTime();

  const billingTrouble = Boolean(subscription?.billing_issues_detected_at);
  const status: SubscriptionStatus = !active ? 'expired' : billingTrouble ? 'past_due' : 'active';

  return {
    plan: active ? 'premium' : 'free',
    status,
    period: periodOf(product, entitlement.product_plan_identifier, subscription?.product_plan_identifier),
    currentPeriodEnd: end,
    // Renewal turned off. A refund needs nothing of its own: RevenueCat ends
    // the entitlement on the day of the refund, so the date above has passed.
    cancelAtPeriodEnd: Boolean(subscription?.unsubscribe_detected_at),
    store: storeOf(subscription?.store),
    sandbox: subscription?.is_sandbox === true,
  };
}

/**
 * The ids in a webhook that could be families. RevenueCat sends the app user
 * id, its aliases, and for a transfer the ids it moved from and to - both
 * families have to be read again. Anonymous ids (`$RCAnonymousID:...`) are
 * never families.
 */
export function familyIdsInWebhook(body: unknown): string[] {
  const event = (body as { event?: unknown } | null)?.event;
  if (!event || typeof event !== 'object') return [];
  const fields = event as Record<string, unknown>;

  const ids = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && /^[a-z0-9]{20,40}$/.test(value)) ids.add(value);
  };
  add(fields.app_user_id);
  add(fields.original_app_user_id);
  for (const key of ['aliases', 'transferred_from', 'transferred_to']) {
    const list = fields[key];
    if (Array.isArray(list)) list.forEach(add);
  }
  // A body naming hundreds is not one RevenueCat sent.
  return [...ids].slice(0, 20);
}

@Injectable()
export class RevenueCatClient {
  constructor(private readonly config: ConfigService) {}

  private get secretKey(): string {
    return (this.config.get<string>('REVENUECAT_SECRET_KEY') ?? '').trim();
  }

  /** The value RevenueCat's dashboard sends in `Authorization` with every webhook. */
  get webhookAuthorization(): string {
    return (this.config.get<string>('REVENUECAT_WEBHOOK_AUTH') ?? '').trim();
  }

  get configured(): boolean {
    return this.secretKey.length > 0;
  }

  async subscriber(appUserId: string): Promise<RcSubscriber> {
    if (!this.configured) {
      throw new ServiceUnavailableException({
        code: 'purchases_unavailable',
        message: 'Purchases are not set up on this server.',
      });
    }

    let response: Response;
    try {
      response = await fetch(`${API}/subscribers/${encodeURIComponent(appUserId)}`, {
        headers: { Authorization: `Bearer ${this.secretKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'purchases_unreachable',
        message: 'The purchase service did not answer.',
      });
    }

    if (!response.ok) {
      throw new ServiceUnavailableException({
        code: 'purchases_unreachable',
        message: `The purchase service answered ${response.status}.`,
      });
    }

    const body = (await response.json()) as { subscriber?: RcSubscriber };
    return body.subscriber ?? {};
  }
}
