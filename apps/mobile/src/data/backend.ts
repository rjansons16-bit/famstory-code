/**
 * Where the app's data comes from.
 *
 * The app has two backends and always has had: `mock.ts`, which needs nothing
 * and is what design review, the browser build and the phone demo run on, and
 * the real API. Until now only the first one was ever reachable — `api.ts` was
 * written, typed and tested, and nothing imported it.
 *
 * This file is the switch. One environment variable decides:
 *
 *     EXPO_PUBLIC_API_URL=http://192.168.120.231:3000/v1
 *
 * Set, and the store talks to the server. Unset, and the app behaves exactly as
 * it did — which is not a fallback to be embarrassed about. The plan lists "the
 * app works without a backend" as a deliverable, because a designer opening the
 * web build should not need PostgreSQL running in WSL.
 *
 * `process.env.EXPO_PUBLIC_*` is inlined at build time by Expo, so this is a
 * constant in the bundle rather than a runtime lookup.
 *
 * A RELATIVE VALUE (`/v1`) means "the same place this page came from". That is
 * how the LAN host serves it (`tools/lan-host/`): one server hands out the web
 * build and passes `/v1` through to the API, so the bundle never contains an IP
 * address. A baked-in `192.168.x.x` is a working app until the router hands the
 * machine a different lease — and then every other computer on the network
 * loses it at once, with nothing on screen to say why. Native builds have no
 * page to be relative to, so they need an absolute URL.
 */

import { FamStoryApi } from './api';
import { HttpClient, type TokenStore } from './http';
import { currentLocale } from './locale';
import { persistedTokens } from './persist';

/**
 * Turn the configured value into something `new URL()` accepts.
 *
 * Exported for the tests: the rule is small, and getting it wrong means a build
 * that silently talks to nothing.
 */
export function resolveBaseUrl(raw: string | undefined, origin: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;

  if (value.startsWith('/')) {
    // Relative only makes sense where there is a page. Without one, pretending
    // to have a server would be worse than admitting there is none.
    if (!origin) return null;
    return `${origin.replace(/\/+$/, '')}${value}`;
  }

  return value;
}

const pageOrigin =
  typeof window !== 'undefined' && typeof window.location?.origin === 'string'
    ? window.location.origin
    : undefined;

export const API_BASE_URL: string | null = resolveBaseUrl(
  process.env.EXPO_PUBLIC_API_URL,
  pageOrigin,
);

/**
 * The tokens, in memory.
 *
 * `HttpClient` reads `accessToken` synchronously on every request, so they
 * cannot live only behind an async store. Disk is the durable copy; this is the
 * one the request path reads.
 */
const tokens: { accessToken: string | null; refreshToken: string | null } = {
  accessToken: null,
  refreshToken: null,
};

let onExpired: (() => void) | null = null;

/**
 * Called when a refresh fails and there is nothing left to try.
 *
 * The store registers itself here rather than the other way round: this file
 * must not import the store, or every screen that touches data would pull the
 * whole state graph in behind it.
 */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onExpired = handler;
}

const tokenStore: TokenStore = {
  get accessToken() {
    return tokens.accessToken;
  },
  get refreshToken() {
    return tokens.refreshToken;
  },
  async save(pair) {
    tokens.accessToken = pair.accessToken;
    tokens.refreshToken = pair.refreshToken;
    await persistedTokens.write(pair);
  },
  async clear() {
    tokens.accessToken = null;
    tokens.refreshToken = null;
    await persistedTokens.clear();
  },
};

let client: FamStoryApi | null | undefined;

/** The API client, or null when this build has no server configured. */
export function getApi(): FamStoryApi | null {
  if (client !== undefined) return client;

  client = API_BASE_URL
    ? new FamStoryApi(
        new HttpClient({
          baseUrl: API_BASE_URL,
          tokens: tokenStore,
          // Read on every request, not captured once: the language can change
          // while the app is open, and anything the server writes back -
          // an invitation, a notification - has to follow it.
          locale: () => currentLocale(),
          onSessionExpired: () => onExpired?.(),
        }),
        API_BASE_URL,
      )
    : null;

  return client;
}

/**
 * Is this build talking to a real server?
 *
 * While the web pages are rendered at build time there is no page yet, so a
 * relative address ("/v1") has nothing to be relative to and there is no
 * client - but the running page will have one. The pre-rendered page has to
 * say what the running one will: the welcome page's HTML said "This is a
 * demo" on the real site, which a search engine read, and the first render in
 * the browser disagreed with it (React #418). So there it counts as the
 * server it will be.
 */
export function isLive(): boolean {
  if (typeof window === 'undefined' && (process.env.EXPO_PUBLIC_API_URL ?? '').trim().startsWith('/')) return true;
  return getApi() !== null;
}

/** Read the stored tokens into memory. Called once, before anything else. */
export async function loadTokens(): Promise<boolean> {
  const stored = await persistedTokens.read();
  if (!stored) return false;

  tokens.accessToken = stored.accessToken;
  tokens.refreshToken = stored.refreshToken;
  return true;
}

export async function saveTokens(pair: {
  accessToken: string;
  refreshToken: string;
}): Promise<void> {
  await tokenStore.save(pair);
}

export async function clearTokens(): Promise<void> {
  await tokenStore.clear();
}

/** The refresh token, for the one call that needs to send it explicitly: logout. */
export function currentRefreshToken(): string | null {
  return tokens.refreshToken;
}
