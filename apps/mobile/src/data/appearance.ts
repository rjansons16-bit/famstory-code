import { Platform } from 'react-native';
import { create } from 'zustand';

import { APPEARANCE_KEY, persistedAppearance } from './persist';

/**
 * Light, dark, or whatever the device says.
 *
 * The Profile screen has always had a Dark mode row, but the app only followed
 * the device, so the row read "Follows your device" and could not be changed.
 * A real switch has to be state that every screen re-renders from — the
 * language switch once shipped as a module variable and did nothing — so the
 * choice lives in this store, and the single hook the theme reads
 * (hooks/use-color-scheme) resolves it against the device.
 *
 * Its own small store rather than a slice of data/store.ts: the theme hook runs
 * in every component, and it should not have to import the family.
 */

export type AppearancePreference = 'system' | 'light' | 'dark';

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** The scheme to draw in. Anything the device reports but "dark" reads as light. */
export function resolveColorScheme(
  preference: AppearancePreference,
  device: string | null | undefined,
): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return device === 'dark' ? 'dark' : 'light';
}

interface AppearanceState {
  preference: AppearancePreference;
  /**
   * False until the stored choice has been read. The root layout waits for it
   * on a phone, where storage is asynchronous, so the first frame is not drawn
   * in the device's theme and then flipped.
   */
  restored: boolean;
  setPreference(preference: AppearancePreference): void;
  restore(): Promise<void>;
}

export const useAppearance = create<AppearanceState>((set, get) => ({
  preference: 'system',
  restored: false,

  setPreference(preference) {
    set({ preference });
    void persistedAppearance.write({ preference });
  },

  async restore() {
    if (get().restored) return;
    const stored = await persistedAppearance.read();
    set({
      restored: true,
      ...(stored && isAppearancePreference(stored.preference)
        ? { preference: stored.preference }
        : null),
    });
  },
}));

// On the web the stored choice can be read before anything renders, and another
// page of the same app — the phone view around it, a second tab — may change it.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const readNow = (): AppearancePreference => {
    const stored = persistedAppearance.readNowOnWeb();
    return stored && isAppearancePreference(stored.preference) ? stored.preference : 'system';
  };

  useAppearance.setState({ preference: readNow(), restored: true });

  window.addEventListener('storage', (event) => {
    if (event.key === APPEARANCE_KEY || event.key === null) {
      useAppearance.setState({ preference: readNow() });
    }
  });
}
