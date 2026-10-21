/**
 * PUSH - in a browser there is none (./push.ts is the phone). The bell inside
 * the app is what the web version has, as it always has; keeping this apart
 * keeps expo-notifications out of the web bundle.
 */

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export interface PushRegistration {
  platform: 'ios' | 'android';
  token: string | null;
  asked: boolean;
  granted: boolean;
}

export function pushAvailable(): boolean {
  return false;
}

export async function pushPermission(): Promise<PushPermission> {
  return 'unavailable';
}

export async function pushToken(_ask: boolean): Promise<PushRegistration | null> {
  return null;
}

export function onPushOpened(_open: (route: string) => void): () => void {
  return () => undefined;
}

export function openPushSettings(): void {}
