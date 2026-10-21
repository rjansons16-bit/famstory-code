/**
 * Persistence across app restarts.
 *
 * Two things were wrong before this file existed: the user was signed out every
 * time they killed the app, and a half-written event was lost the moment they
 * navigated away. On a phone an interruption is the normal case, not the
 * exception.
 *
 * WHY SECURE STORE AND NOT A PLAIN KEY-VALUE STORE:
 * session tokens are credentials. On iOS this is the Keychain and on Android
 * the encrypted SharedPreferences — both survive a restart and neither is
 * readable by another app. `AsyncStorage` is a plain file and would put tokens
 * on disk in the clear.
 *
 * Drafts are not credentials and do not need encryption, but they go through
 * the same store rather than adding a second dependency for the sake of it.
 * If drafts ever grow large (photos included), move them out — SecureStore is
 * designed for small values, not blobs.
 *
 * ON WEB there is no secure storage at all. `localStorage` is the fallback,
 * which is fine here because the web build is the design and development
 * target, not a shipping surface — the plan (docs/00-PLAN.md) ships iOS and
 * Android. If web ever ships, tokens must move to an httpOnly cookie instead;
 * localStorage is readable by any injected script.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

/**
 * Every call is wrapped: storage fails for reasons the app cannot fix — a
 * locked keychain, a private browsing window, a user who cleared site data.
 * None of those is a reason to crash on launch, so a failed read is treated as
 * "nothing stored".
 */
async function getItem(key: string): Promise<string | null> {
  try {
    if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  try {
    if (isWeb) globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Persisting is a convenience. Losing it must not break the action that
    // triggered it — the user still gets what they asked for, in memory.
  }
}

async function removeItem(key: string): Promise<void> {
  try {
    if (isWeb) globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // Same reasoning as setItem.
  }
}

// ---------------------------------------------------------------------------
// Typed helpers
// ---------------------------------------------------------------------------

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A corrupt value is worse than no value: it would fail again on every
    // launch. Drop it once and move on.
    void removeItem(key);
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await setItem(key, JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

const SESSION_KEY = 'famstory.session';

/**
 * What is kept between launches.
 *
 * Deliberately small. With the real API this becomes `{ accessToken,
 * refreshToken }` plus a `GET /users/me` on boot — the family and its events
 * come from the server, never from the device. Caching the whole family here
 * would mean a removed member keeps a copy of everything on their phone.
 */
export interface PersistedSession {
  /** Which mock identity was signed in. Replaced by tokens against a real API. */
  kind: 'existing' | 'new';
  onboardingComplete: boolean;
}

export const persistedSession = {
  read: () => readJson<PersistedSession>(SESSION_KEY),
  write: (value: PersistedSession) => writeJson(SESSION_KEY, value),
  clear: () => removeItem(SESSION_KEY),
};

// ---------------------------------------------------------------------------
// The tokens
// ---------------------------------------------------------------------------

const TOKENS_KEY = 'famstory.tokens';

/**
 * The only thing about a session worth keeping between launches.
 *
 * Not the family, not the events, not the member list — those come from the
 * server on every launch. Caching them here would leave a removed member
 * holding a copy of everything on their phone, and no revocation on the server
 * could take it back.
 */
export interface PersistedTokens {
  accessToken: string;
  refreshToken: string;
}

export const persistedTokens = {
  read: () => readJson<PersistedTokens>(TOKENS_KEY),
  write: (value: PersistedTokens) => writeJson(TOKENS_KEY, value),
  clear: () => removeItem(TOKENS_KEY),
};

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

export const APPEARANCE_KEY = 'famstory.appearance';

/**
 * Light, dark, or the device's choice. How this person likes to read — not
 * family data, so nothing about it would outlive a removal from the family.
 */
export interface PersistedAppearance {
  preference: string;
}

export const persistedAppearance = {
  read: () => readJson<PersistedAppearance>(APPEARANCE_KEY),
  write: (value: PersistedAppearance) => writeJson(APPEARANCE_KEY, value),
  /**
   * Web only, where storage is synchronous: read before the first render, so
   * the page does not paint in the device's theme and then flip.
   */
  readNowOnWeb(): PersistedAppearance | null {
    if (!isWeb) return null;
    try {
      const raw = globalThis.localStorage?.getItem(APPEARANCE_KEY);
      return raw ? (JSON.parse(raw) as PersistedAppearance) : null;
    } catch {
      return null;
    }
  },
};

// ---------------------------------------------------------------------------
// The language
// ---------------------------------------------------------------------------

export const LOCALE_KEY = 'famstory.locale';

/**
 * Which language the app speaks. Like the theme, this is how a person reads
 * rather than anything about their family, so it stays on the device.
 */
export interface PersistedLocale {
  locale: string;
}

export const persistedLocale = {
  read: () => readJson<PersistedLocale>(LOCALE_KEY),
  write: (value: PersistedLocale) => writeJson(LOCALE_KEY, value),
  /** Web only: read before the first render, so no screen paints in English and flips. */
  readNowOnWeb(): PersistedLocale | null {
    if (!isWeb) return null;
    try {
      const raw = globalThis.localStorage?.getItem(LOCALE_KEY);
      return raw ? (JSON.parse(raw) as PersistedLocale) : null;
    } catch {
      return null;
    }
  },
};

// ---------------------------------------------------------------------------
// The composer draft
// ---------------------------------------------------------------------------

const DRAFT_KEY = 'famstory.draft';

/** Only the typed text. Pickers re-open on their defaults; a half-typed story does not come back on its own. */
export interface PersistedDraft {
  title: string;
  description: string;
  savedAt: string;
}

export const persistedDraft = {
  read: () => readJson<PersistedDraft>(DRAFT_KEY),
  write: (value: PersistedDraft) => writeJson(DRAFT_KEY, value),
  clear: () => removeItem(DRAFT_KEY),
};
