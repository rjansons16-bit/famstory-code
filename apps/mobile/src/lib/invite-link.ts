import { Platform } from 'react-native';

import { SITE_ORIGIN } from './site';

/**
 * THE ADDRESS AN INVITATION POINTS AT.
 *
 * An invitation used to be a code somebody had to type into a screen they did
 * not have open yet. A link is the same code with the hard part removed: the
 * person taps it and lands on a page that already knows which family it is.
 *
 * On the web the link is this build's own address, whatever that is - the LAN
 * IP at home, a tunnel, a domain later - because the person sharing it is
 * looking at exactly the address their family can reach. Hardcoding one would
 * be wrong on all the others.
 *
 * On a phone there is no page, so the link is the public site's
 * (EXPO_PUBLIC_SITE_ORIGIN, lib/site.ts): it opens the app where it is
 * installed - associated domains and app links, app.config.js - and the web
 * app where it is not, so the person invited can join from anything. A build
 * with no https site (Expo Go, the demo) falls back to the app's own scheme
 * (`famstory://`, app.json), which only opens where the app already is; the
 * code travels with the link for that, in `inviteMessage`.
 */
export function inviteLink(code: string, site: string = SITE_ORIGIN): string {
  const path = `/join/${encodeURIComponent(code)}`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }

  if (site.startsWith('https://')) return `${site}${path}`;
  return `famstory:/${path}`;
}

/** What somebody actually sends. The code is repeated for anybody whose phone eats links. */
export function inviteMessage(familyName: string, code: string): string {
  return `${familyName} · FamStory\n${inviteLink(code)}\n${code}`;
}
