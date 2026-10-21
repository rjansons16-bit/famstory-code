/**
 * BUYING PREMIUM IN THE STORE - on a phone (./purchases.web.ts is the web).
 *
 * The App Store and Google Play sell the subscription; RevenueCat
 * (react-native-purchases) talks to them for us (docs/09-APP-STORES.md §3.2).
 * The family's id is RevenueCat's app user id, so a purchase belongs to the
 * family it was made in and every member's app sees it
 * (docs/02-DATA-MODEL.md, Subscriptions).
 *
 * Nothing here decides that the family has Premium. After a purchase or a
 * restore the store asks our server to read the family again
 * (`syncSubscription`), and the plan the server answers is the plan.
 *
 * In Expo Go the SDK runs in its own preview mode, with no store behind it;
 * real purchases need a TestFlight or Play test build. Without a key for this
 * platform (`EXPO_PUBLIC_REVENUECAT_APPLE_KEY` / `_GOOGLE_KEY`, eas.json)
 * there is no store at all, and `purchasesAvailable()` says so.
 */

import { Linking, Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type PurchasesError,
  type PurchasesPackage,
} from 'react-native-purchases';

import { optionFrom, type StoreOffer, type StoreOption } from '@/domain/store-offer';

export type { StoreOffer, StoreOption } from '@/domain/store-offer';

/** The entitlement configured in RevenueCat (docs/12-LAUNCH-RUNBOOK.md). */
const ENTITLEMENT = 'premium';

const KEY =
  (Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY
    : Platform.OS === 'android'
      ? process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY
      : undefined
  )?.trim() ?? '';

export function purchasesAvailable(): boolean {
  return KEY.length > 0;
}

/** Why a purchase did not go through, as a token for the screen and the counts. */
export type PurchaseFailure =
  | 'not_allowed'
  | 'already_bought'
  | 'network'
  | 'store'
  | 'unavailable'
  | 'unknown';

export class PurchaseError extends Error {
  constructor(readonly reason: PurchaseFailure) {
    super(reason);
  }
}

let configured = false;
let identifiedAs: string | null = null;
/** The packages behind the options last shown, so `buy` gets the store's own object. */
const packages = new Map<string, PurchasesPackage>();

/** Signs RevenueCat in as this family - once, then only when the family changes. */
async function as(familyId: string): Promise<void> {
  if (!purchasesAvailable()) throw new PurchaseError('unavailable');
  if (!configured) {
    if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: KEY, appUserID: familyId });
    configured = true;
    identifiedAs = familyId;
    return;
  }
  if (identifiedAs !== familyId) {
    await Purchases.logIn(familyId);
    identifiedAs = familyId;
  }
}

function failure(error: unknown): PurchaseError {
  if (error instanceof PurchaseError) return error;
  const code = (error as Partial<PurchasesError> | null)?.code;
  switch (code) {
    case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
      return new PurchaseError('not_allowed');
    case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
    case PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR:
    case PURCHASES_ERROR_CODE.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR:
      return new PurchaseError('already_bought');
    case PURCHASES_ERROR_CODE.NETWORK_ERROR:
      return new PurchaseError('network');
    case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
      return new PurchaseError('store');
    default:
      return new PurchaseError('unknown');
  }
}

/** The monthly and the yearly option, with the store's own prices; null when the store has none. */
export async function loadOffer(familyId: string): Promise<StoreOffer | null> {
  try {
    await as(familyId);
    const offering = (await Purchases.getOfferings()).current;
    if (!offering) return null;

    packages.clear();
    const option = (pkg: PurchasesPackage | null, period: 'monthly' | 'annual'): StoreOption | null => {
      if (!pkg) return null;
      packages.set(pkg.identifier, pkg);
      return optionFrom(pkg.identifier, period, pkg.product);
    };
    const offer = { monthly: option(offering.monthly, 'monthly'), annual: option(offering.annual, 'annual') };
    return offer.monthly || offer.annual ? offer : null;
  } catch (error) {
    throw failure(error);
  }
}

/**
 * The store's own purchase sheet. `cancelled` when the person closed it,
 * `pending` when somebody else has to approve it (Ask to Buy, a slow card).
 * `bought` says the store took the payment; whether the family has Premium is
 * still the server's answer, after `syncSubscription`.
 */
export async function buy(familyId: string, option: StoreOption): Promise<'bought' | 'cancelled' | 'pending'> {
  const pkg = packages.get(option.id);
  if (!pkg) throw new PurchaseError('unavailable');
  try {
    await as(familyId);
    await Purchases.purchasePackage(pkg);
    return 'bought';
  } catch (error) {
    const code = (error as Partial<PurchasesError> | null)?.code;
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return 'cancelled';
    if (code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
    throw failure(error);
  }
}

/** The store's purchases for this Apple ID or Google account, moved to this family. */
export async function restore(familyId: string): Promise<boolean> {
  try {
    await as(familyId);
    const info = await Purchases.restorePurchases();
    return Boolean(info.entitlements.active[ENTITLEMENT]);
  } catch (error) {
    throw failure(error);
  }
}

/** Where the person turns renewal off: the store's own page. */
export async function openManagement(): Promise<void> {
  let url: string | null = null;
  try {
    if (configured) url = (await Purchases.getCustomerInfo()).managementURL;
  } catch {
    // The store's general page below is as good.
  }
  await Linking.openURL(
    url ??
      (Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions'),
  );
}

/** Signing out: the next person on this phone is not this family in RevenueCat. */
export async function forgetPurchases(): Promise<void> {
  packages.clear();
  if (!configured || identifiedAs === null) return;
  identifiedAs = null;
  try {
    await Purchases.logOut();
  } catch {
    // Already anonymous: nothing to forget.
  }
}
