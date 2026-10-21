import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { installConsoleSink, setAnalyticsSink } from '@/domain/analytics';

import type { TelemetryEvent } from './api';
import { getApi } from './backend';
import { useApp } from './store';

/**
 * WHERE `track()` GOES, AND WHAT HAPPENS WHEN THE APP BREAKS.
 *
 * Until this file the KPI events (domain/analytics.ts) went to the console,
 * which is to say nowhere - and the month-12 decision is made on them. Now,
 * against a real server, they go to our own API (modules/telemetry): no
 * outside service, no person in them, only the family.
 *
 * Batched, because a family scrolling the timeline would otherwise be a
 * request per tap: sent every FLUSH_EVERY_MS, at FLUSH_AT events, and when
 * the app goes out of sight. A batch that fails goes back in line once, up to
 * MAX_QUEUE - counting is not worth a retry storm or a banner, and losing a
 * few events to a tunnel is the right trade.
 *
 * Nothing is queued while nobody is signed in, or for somebody who switched
 * counting off (User.shareUsageStats) - and the server refuses it for them
 * too, so this is a saving, not the safeguard.
 *
 * The demo and design builds have no server, and keep the console.
 */

const FLUSH_EVERY_MS = 15_000;
const FLUSH_AT = 20;
const BATCH = 50;
const MAX_QUEUE = 200;
/** A broken screen re-rendering is one report, not a thousand. */
const MAX_REPORTS = 10;

let queue: TelemetryEvent[] = [];
let installed = false;
const reported = new Set<string>();

function counting(): boolean {
  const session = useApp.getState().session;
  return !!session && session.user.shareUsageStats !== false;
}

export async function flush(): Promise<void> {
  const api = getApi();
  if (!api || queue.length === 0) return;
  if (!counting()) {
    queue = [];
    return;
  }

  const batch = queue.slice(0, BATCH);
  queue = queue.slice(BATCH);
  try {
    await api.sendTelemetry(useApp.getState().family?.id, batch);
  } catch {
    queue = [...batch, ...queue].slice(-MAX_QUEUE);
  }
}

/** Mounted once, at the root. Returns the way to take it down again (tests). */
export function installTelemetry(): () => void {
  if (!getApi()) {
    installConsoleSink();
    return () => {};
  }
  if (installed) return () => {};
  installed = true;

  setAnalyticsSink((event) => {
    if (__DEV__) console.log('[analytics]', event.name, event);
    if (!counting()) return;

    const { name, ...props } = event;
    queue.push({ name, props, at: new Date().toISOString() });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    if (queue.length >= FLUSH_AT) void flush();
  });

  const timer = setInterval(() => void flush(), FLUSH_EVERY_MS);
  const appState = AppState.addEventListener('change', (status) => {
    if (status !== 'active') void flush();
  });
  const removeErrorHandlers = installErrorHandlers();

  return () => {
    clearInterval(timer);
    appState.remove();
    removeErrorHandlers();
    installed = false;
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function currentRoute(): string | undefined {
  // The server keeps the pattern, never the id in it (modules/telemetry/scrub.ts).
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location?.pathname;
  return undefined;
}

/**
 * Tell the server something broke. Never throws, never retries, and says
 * nothing on screen - the person already saw it break.
 */
export function reportError(error: unknown): void {
  const api = getApi();
  if (!api) return;
  // Before sign-in nobody has said no, and the report carries nobody. After,
  // the same switch as the counters.
  const session = useApp.getState().session;
  if (session && session.user.shareUsageStats === false) return;

  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : typeof error === 'string' ? error : '';
  if (!message || reported.has(message) || reported.size >= MAX_REPORTS) return;
  reported.add(message);

  void api
    .reportError({
      message,
      stack: error instanceof Error ? error.stack : undefined,
      platform: Platform.OS,
      route: currentRoute(),
      appVersion: Constants.expoConfig?.version,
    })
    .catch(() => undefined);
}

interface GlobalErrorUtils {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

/** What the platform catches that no component did. */
function installErrorHandlers(): () => void {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return () => {};
    const onError = (event: ErrorEvent) => reportError(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }

  const utils = (globalThis as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
  if (!utils) return () => {};
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    reportError(error);
    // The platform's own handling still runs: the red box in development,
    // the crash it has to be in a release build.
    previous(error, isFatal);
  });
  return () => utils.setGlobalHandler(previous);
}
