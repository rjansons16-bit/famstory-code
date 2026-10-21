import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { t } from '@/i18n';

import { routeForPush } from './push-route';

/**
 * PUSH ON THE PHONE - the bell's news on the lock screen, for whoever said
 * yes. (./push.web.ts is the browser, which has none.)
 *
 * The phone's own token, Apple's or Google's, goes to the server
 * (`POST /users/me/devices`, data/store.ts registerPush), which knocks with a
 * line that holds nothing the family wrote; the app shows which entry once
 * it is opened. No Expo push service in between, and so no Expo project id:
 * the server speaks to APNs and FCM itself.
 *
 * Asked at a moment the person can see why - saving an entry with a
 * reminder, or the switch in Settings - never at the first launch. A build
 * without the keys (Expo Go; an Android build made before google-services.json
 * existed) simply has no token, and the bell inside the app works as before.
 */

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/** A reminder that arrives while the app is open is still shown. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function pushAvailable(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export async function pushPermission(): Promise<PushPermission> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    return current.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export interface PushRegistration {
  platform: 'ios' | 'android';
  token: string | null;
  /** Whether the phone's question was shown just now. */
  asked: boolean;
  granted: boolean;
}

/**
 * The phone's push token, asking first when `ask` and the phone may still
 * ask. Null only when something failed on the way.
 */
export async function pushToken(ask: boolean): Promise<PushRegistration | null> {
  if (!pushAvailable()) return null;
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  try {
    if (platform === 'android') {
      // Android 13 asks only once a channel exists; the server's pushes name this one.
      await Notifications.setNotificationChannelAsync('default', {
        name: t('push.channel'),
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    let asked = false;
    if (!granted && ask && current.canAskAgain) {
      const answer = await Notifications.requestPermissionsAsync();
      granted = answer.granted;
      asked = true;
    }
    if (!granted) return { platform, token: null, asked, granted: false };

    const device = await Notifications.getDevicePushTokenAsync();
    return { platform, token: typeof device.data === 'string' ? device.data : null, asked, granted: true };
  } catch {
    return null;
  }
}

/** Whether the tap that started this run of the app has been dealt with. */
let launchHandled = false;

/**
 * A tapped notification: the one that opened the app, then every one after.
 * Returns the way to stop listening.
 *
 * The one that opened the app only once per run: the root mounts this again
 * whenever the language changes (its tree is keyed on it), and the phone
 * keeps answering "the last tap" - which would open that entry again.
 */
export function onPushOpened(open: (route: string) => void): () => void {
  if (!launchHandled) {
    launchHandled = true;
    const first = Notifications.getLastNotificationResponse();
    if (first) open(routeForPush(first.notification.request.content.data));
  }
  const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
    open(routeForPush(response.notification.request.content.data)),
  );
  return () => subscription.remove();
}

/** Said no once: only the phone's own settings can change it now. */
export function openPushSettings(): void {
  void Linking.openSettings();
}
