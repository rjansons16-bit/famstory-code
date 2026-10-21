/**
 * expo-notifications in the tests: no test should ask a phone for permission
 * or wait on Apple's token. Permission is "not asked yet" and the token is
 * none, which is what a fresh install looks like. lib/push.ts is the only
 * importer.
 */

export const AndroidImportance = { DEFAULT: 3, HIGH: 4, MAX: 5 } as const;

export const setNotificationHandler = jest.fn();
export const setNotificationChannelAsync = jest.fn(async () => null);
export const getPermissionsAsync = jest.fn(async () => ({
  granted: false,
  canAskAgain: true,
  status: 'undetermined',
}));
export const requestPermissionsAsync = jest.fn(async () => ({
  granted: false,
  canAskAgain: false,
  status: 'denied',
}));
export const getDevicePushTokenAsync = jest.fn(async () => ({ type: 'ios', data: '' }));
export const getLastNotificationResponse = jest.fn(() => null);
export const addNotificationResponseReceivedListener = jest.fn(() => ({ remove: jest.fn() }));
