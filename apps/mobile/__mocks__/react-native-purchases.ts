/**
 * RevenueCat's SDK in the tests: Jest uses this instead of the package for
 * every test, because the package's web billing library ships as ES modules
 * Jest does not transform, and because no test should reach a store.
 * lib/purchases.ts is the only importer.
 */

export const LOG_LEVEL = { VERBOSE: 'VERBOSE', DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' } as const;

export const PURCHASES_ERROR_CODE = {
  PURCHASE_CANCELLED_ERROR: '1',
  STORE_PROBLEM_ERROR: '2',
  PURCHASE_NOT_ALLOWED_ERROR: '3',
  PRODUCT_ALREADY_PURCHASED_ERROR: '6',
  RECEIPT_ALREADY_IN_USE_ERROR: '7',
  NETWORK_ERROR: '10',
  RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR: '13',
  PAYMENT_PENDING_ERROR: '20',
} as const;

const customerInfo = { entitlements: { active: {} }, managementURL: null };

const Purchases = {
  configure: jest.fn(),
  setLogLevel: jest.fn(async () => undefined),
  logIn: jest.fn(async () => ({ customerInfo, created: false })),
  logOut: jest.fn(async () => customerInfo),
  getOfferings: jest.fn(async () => ({ current: null, all: {} })),
  purchasePackage: jest.fn(async () => ({ customerInfo })),
  restorePurchases: jest.fn(async () => customerInfo),
  getCustomerInfo: jest.fn(async () => customerInfo),
};

export default Purchases;
