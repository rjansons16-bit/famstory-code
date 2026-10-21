/**
 * WHAT AN ERROR REPORT MAY SAY.
 *
 * An error message is the app's own words most of the time - "undefined is not
 * a function" - but not always: a failed request can carry the address it was
 * for, and an address can carry a guest link's token or a signed media URL.
 * A token in this table would be a working key to a family's page in a table
 * nobody thinks of as secret.
 *
 * So everything that could be a key or a person goes before it is stored:
 * query strings, long runs of letters and digits (tokens, signatures, hashes),
 * email addresses, and every path segment that is not a plain word. What is
 * left is enough to find the bug and not enough to find anyone.
 */

const MESSAGE_MAX = 500;
const STACK_MAX = 4000;
const ROUTE_MAX = 120;
const VERSION = /^[0-9A-Za-z.+-]{1,32}$/;
const PLATFORMS = new Set(['web', 'ios', 'android']);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Everything after a "?" up to the next space or quote: a query string. */
const QUERY = /\?[^\s"'`)]*/g;
/** 20+ letters and digits in a row, or 16+ hex: tokens, signatures, cuid-like ids. */
const LONG_TOKEN = /\b(?:[A-Za-z0-9_-]{20,}|[a-f0-9]{16,})\b/g;

export function scrubText(text: string, max: number): string {
  return text.replace(EMAIL, '[email]').replace(QUERY, '?[…]').replace(LONG_TOKEN, '[…]').slice(0, max);
}

/**
 * A route as a pattern. "/event/cm1x2y3z" is "/event/:id", "/guest/<token>"
 * is "/guest/:id" - the segment that names something is the one that goes.
 */
export function scrubRoute(route: unknown): string | null {
  if (typeof route !== 'string' || !route.startsWith('/')) return null;
  const path = route.split(/[?#]/)[0];
  const pattern = path
    .split('/')
    .map((segment) => (segment === '' || /^\(?[a-z-]{1,24}\)?$/.test(segment) ? segment : ':id'))
    .join('/');
  return pattern.slice(0, ROUTE_MAX);
}

export interface ClientErrorInput {
  message?: unknown;
  stack?: unknown;
  platform?: unknown;
  route?: unknown;
  appVersion?: unknown;
}

export interface ScrubbedError {
  message: string;
  stack: string | null;
  platform: string;
  route: string | null;
  appVersion: string | null;
}

/** The report as it may be kept, or null when there is nothing to keep. */
export function scrubError(input: ClientErrorInput): ScrubbedError | null {
  if (typeof input.message !== 'string' || input.message.trim() === '') return null;
  return {
    message: scrubText(input.message.trim(), MESSAGE_MAX),
    stack: typeof input.stack === 'string' && input.stack ? scrubText(input.stack, STACK_MAX) : null,
    platform: typeof input.platform === 'string' && PLATFORMS.has(input.platform) ? input.platform : 'unknown',
    route: scrubRoute(input.route),
    appVersion:
      typeof input.appVersion === 'string' && VERSION.test(input.appVersion) ? input.appVersion : null,
  };
}
