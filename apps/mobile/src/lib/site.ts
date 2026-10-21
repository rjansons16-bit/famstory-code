/**
 * WHERE THE WEB APP IS PUBLIC, when it is: the origin a search engine and a
 * shared link should name, such as https://famstory.example.
 *
 * Set when the web build is made on the server (tools/deploy/web.Dockerfile,
 * from DOMAIN). Blank for the laptop's LAN build, where there is nothing
 * public to name - and then nothing names it: a link preview gets a relative
 * picture and no page claims a canonical address it does not have. So is
 * anything that is not an origin: a build made without DOMAIN says
 * "https://", and a page naming "https:/og-image.png" is worse than none.
 */
const configured = (process.env.EXPO_PUBLIC_SITE_ORIGIN ?? '').trim().replace(/\/+$/, '');

export const SITE_ORIGIN = /^https?:\/\/[^/\s]+$/.test(configured) ? configured : '';

/**
 * The app's pages in the two stores, once it is in them: the welcome page
 * links to them instead of saying "coming soon". Set on the server, like the
 * origin (tools/deploy/.env, APP_STORE_URL and PLAY_STORE_URL; the runbook's
 * release day). Only a store's own address counts - a typo links nowhere
 * rather than somewhere else.
 */
function storeUrl(value: string | undefined, prefix: string): string {
  const url = (value ?? '').trim();
  return url.startsWith(prefix) && !/\s/.test(url) ? url : '';
}

export const APP_STORE_URL = storeUrl(process.env.EXPO_PUBLIC_APP_STORE_URL, 'https://apps.apple.com/');
export const PLAY_STORE_URL = storeUrl(process.env.EXPO_PUBLIC_PLAY_STORE_URL, 'https://play.google.com/');
