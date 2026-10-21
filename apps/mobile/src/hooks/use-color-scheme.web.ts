import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

import { resolveColorScheme, useAppearance, type AppearancePreference } from '@/data/appearance';

/**
 * Colour scheme on web.
 *
 * The web output in app.json is `static`, so the page is pre-rendered on the
 * server where `prefers-color-scheme` is unknown. If the first client render
 * disagrees with the server HTML, React reports a hydration mismatch.
 *
 * The fix is `useSyncExternalStore` with a separate server snapshot: during
 * hydration it returns 'light' (what the server saw), and only afterwards the
 * real value.
 *
 * The previous version did this with `setState` in an effect. That works, but
 * it causes a cascading render on every page load, and the React lint rule
 * flags it as an error for good reason.
 *
 * The same holds for the choice made on the Profile screen (data/appearance.ts):
 * it comes from localStorage, which the server does not have either, so during
 * hydration it too reads as "follow the device".
 */

function subscribeToDevice(onChange: () => void): () => void {
  const subscription = Appearance.addChangeListener(onChange);
  return () => subscription.remove();
}

/**
 * `Appearance.getColorScheme()` can also return null or undefined when the
 * system setting is unknown. Callers would treat that as light anyway, so we
 * normalise here instead of spreading the uncertainty.
 */
function getDeviceSnapshot(): 'light' | 'dark' {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

function getDeviceServerSnapshot(): 'light' | 'dark' {
  return 'light';
}

function getPreferenceSnapshot(): AppearancePreference {
  return useAppearance.getState().preference;
}

function getPreferenceServerSnapshot(): AppearancePreference {
  return 'system';
}

export function useColorScheme(): 'light' | 'dark' {
  const device = useSyncExternalStore(subscribeToDevice, getDeviceSnapshot, getDeviceServerSnapshot);
  const preference = useSyncExternalStore(
    useAppearance.subscribe,
    getPreferenceSnapshot,
    getPreferenceServerSnapshot,
  );
  return resolveColorScheme(preference, device);
}
