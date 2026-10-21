import { Platform } from 'react-native';
import { create } from 'zustand';

import { LOCALE_KEY, persistedLocale } from './persist';

/**
 * WHICH LANGUAGE THE APP SPEAKS.
 *
 * English was the MVP's only language, and for the families this is being
 * built for that is the thing standing between the product and the people in
 * it: a grandmother does not read "Coming up".
 *
 * The choice lives in a store because a language switch has to be REACTIVE.
 * One already shipped as a module-level variable with a setter, and it did
 * nothing at all - React never learned the value had changed. See i18n/index.ts
 * for how the screens are made to re-read it, and why `t()` is still a plain
 * function rather than a hook.
 *
 * Its own small store, next to the theme, for the same reason: `t()` is called
 * from date formatting and error mapping as well as from components, and none
 * of those should have to import the family to know what language to speak.
 */

export type Locale = 'en' | 'lv';

export const LOCALES: Locale[] = ['en', 'lv'];

/** What each language calls itself. Never translated — that is the point. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  lv: 'Latviešu',
};

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'lv';
}

interface LocaleState {
  locale: Locale;
  /**
   * False until the stored choice has been read. The root waits for it on a
   * phone, where storage is asynchronous, so the first screen is not drawn in
   * English and then swapped.
   */
  restored: boolean;
  setLocale(locale: Locale): void;
  restore(): Promise<void>;
}

/**
 * The default is English, not the device's language.
 *
 * A Latvian phone would otherwise switch the app to a translation the person
 * has never seen, mid-sentence, because they crossed a border or changed a
 * setting for something else. The switch is in Settings, one tap, and what it
 * is set to stays set.
 */
export const useLocale = create<LocaleState>((set, get) => ({
  locale: 'en',
  restored: false,

  setLocale(locale) {
    set({ locale });
    void persistedLocale.write({ locale });
  },

  async restore() {
    if (get().restored) return;
    const stored = await persistedLocale.read();
    set({
      restored: true,
      ...(stored && isLocale(stored.locale) ? { locale: stored.locale } : null),
    });
  },
}));

/** The language `t()` answers in. Not a hook: helpers outside React call it. */
export function currentLocale(): Locale {
  return useLocale.getState().locale;
}

// On the web another page of the same app - the phone frame around it, a second
// tab - can change the language, and this page has to follow.
//
// Note what is NOT done here, unlike the theme next door: the stored choice is
// not applied before the first render. The web build is pre-rendered HTML, and
// that HTML is in English; a first client render in Latvian would not match it,
// and React would report a hydration failure on every load for exactly the
// people this language exists for. So the page hydrates in English and
// `restore()` - an effect, after hydration - switches it. One frame, no error.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const readNow = (): Locale => {
    const stored = persistedLocale.readNowOnWeb();
    return stored && isLocale(stored.locale) ? stored.locale : 'en';
  };

  window.addEventListener('storage', (event) => {
    if (event.key === LOCALE_KEY || event.key === null) {
      useLocale.setState({ locale: readNow() });
    }
  });
}
