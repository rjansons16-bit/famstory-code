/**
 * BUYING PREMIUM - on the web there is no store (./purchases.ts is the phone).
 *
 * Premium is sold by the App Store and Google Play; the web app says so and
 * sells nothing (docs/05-API.md, Subscription: Stripe is not built). Keeping
 * this file apart also keeps RevenueCat's SDK, and the web billing library
 * it carries, out of the web bundle.
 */

import type { StoreOffer, StoreOption } from '@/domain/store-offer';

export type { StoreOffer, StoreOption } from '@/domain/store-offer';

export type PurchaseFailure = 'not_allowed' | 'already_bought' | 'network' | 'store' | 'unavailable' | 'unknown';

export class PurchaseError extends Error {
  constructor(readonly reason: PurchaseFailure) {
    super(reason);
  }
}

export function purchasesAvailable(): boolean {
  return false;
}

export async function loadOffer(_familyId: string): Promise<StoreOffer | null> {
  return null;
}

export async function buy(_familyId: string, _option: StoreOption): Promise<'bought' | 'cancelled' | 'pending'> {
  throw new PurchaseError('unavailable');
}

export async function restore(_familyId: string): Promise<boolean> {
  throw new PurchaseError('unavailable');
}

export async function openManagement(): Promise<void> {}

export async function forgetPurchases(): Promise<void> {}
