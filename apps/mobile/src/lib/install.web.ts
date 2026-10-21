/**
 * INSTALLING THE WEB APP - FamStory on a computer or a phone as an app of its
 * own, with its own window and icon, straight from the browser and with no
 * store in between.
 *
 * What makes a browser offer it is on the page: the manifest and the icons
 * (public/manifest.webmanifest) and a service worker (public/sw.js), which is
 * registered here. The worker keeps nothing; the file says why.
 *
 * Browsers differ in what they let a page do about it:
 *  - Chrome and Edge, on a computer and on Android, hand the page a prompt
 *    (`beforeinstallprompt`) that a button can open. It can arrive before this
 *    script has run, so the page's first script holds it (app/+html.tsx).
 *  - Safari on an iPhone or iPad has no prompt: the person adds the app from
 *    the Share menu, so the page says where.
 *  - Elsewhere - Firefox on a computer, or a plain-http address on the local
 *    network, where a browser allows no worker - there is nothing to offer,
 *    and nothing is shown.
 */

import { useSyncExternalStore } from 'react';

import { track } from '@/domain/analytics';
import type { DeviceKind, InstallOffer } from './install';

export type { DeviceKind, InstallOffer };

/** The browser's offer. Not in the DOM's own types: only Chromium has it. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    /** Held by the page's first script (app/+html.tsx) until this module runs. */
    __famstoryInstallOffer?: InstallPromptEvent;
  }
}

let offer: InstallPromptEvent | null = null;
let installedHere = false;
let started = false;
const watchers = new Set<() => void>();

function changed(): void {
  for (const notify of watchers) notify();
}

function watch(notify: () => void): () => void {
  watchers.add(notify);
  return () => {
    watchers.delete(notify);
  };
}

/** This page is the installed app, in its own window. */
function runningInstalled(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // Safari on iOS says it here instead.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** An iPhone or iPad. iPadOS asks for the desktop site, but has a touch screen. */
function appleTouch(): boolean {
  const agent = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
}

/** Which kind of device, for the one number this is counted by. */
function platform(): DeviceKind {
  if (/Android/.test(navigator.userAgent)) return 'android';
  return appleTouch() ? 'ios' : 'desktop';
}

/**
 * FamStory opened as an app rather than a site in a browser (app/index.tsx):
 * installed, or started the way the installed app is - at the manifest's
 * start_url, /?source=installed, which the phone view (tools/lan-host/
 * phone.html) opens its app at too. The address is read once, as the page
 * loads: after the first screen it is gone.
 */
const startedAsApp =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('source') === 'installed';

export function openedAsApp(): boolean {
  return startedAsApp || (typeof window !== 'undefined' && runningInstalled());
}

const noSubscription = () => () => {};

/** Which kind of device, for the words an install is offered in: a computer in the pre-rendered page. */
export function useDeviceKind(): DeviceKind {
  return useSyncExternalStore(noSubscription, platform, () => 'desktop' as const);
}

/**
 * Whether a browser would install from this address at all: a worker, and so
 * an install, needs https or the machine itself - not the laptop's plain-http
 * address on the local network. Secure in the pre-rendered page.
 */
export function useSecurePage(): boolean {
  return useSyncExternalStore(noSubscription, () => window.isSecureContext, () => true);
}

function snapshot(): InstallOffer {
  if (installedHere || runningInstalled()) return 'done';
  if (offer) return 'prompt';
  if (appleTouch()) return 'ios';
  return 'none';
}

/**
 * What the pre-rendered HTML was made with - there is no browser at build
 * time - and so what hydration has to see too. The real answer follows at
 * once (hooks/use-color-scheme.web.ts does the same).
 */
function serverSnapshot(): InstallOffer {
  return 'none';
}

export function useInstallOffer(): InstallOffer {
  return useSyncExternalStore(watch, snapshot, serverSnapshot);
}

/**
 * Registers the worker and starts listening for the browser's offer. Once,
 * from the root layout; again is a no-op.
 */
export function startInstallSupport(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Held for the app's own button rather than the browser's banner.
    event.preventDefault();
    offer = event as InstallPromptEvent;
    changed();
  });

  window.addEventListener('appinstalled', () => {
    offer = null;
    installedHere = true;
    // Counted only for somebody signed in (data/telemetry.ts): an install
    // from the welcome page, before an account exists, goes uncounted.
    track({ name: 'app_installed', platform: platform() });
    changed();
  });

  // A worker needs a secure page - https, or localhost. On a plain-http LAN
  // address `navigator.serviceWorker` is not even there.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Without it, some browsers offer no install. Nothing else changes.
    });
  }

  const early = window.__famstoryInstallOffer;
  if (early) {
    offer = early;
    changed();
  }
}

/**
 * Opens the browser's install prompt; true when the person said yes. Must be
 * called from a press - the browser refuses a prompt nobody asked for.
 */
export async function install(): Promise<boolean> {
  const pending = offer;
  if (!pending) return false;

  // Each offer opens once, whatever the answer. The browser makes a new one
  // later if the app is still not installed.
  offer = null;
  try {
    await pending.prompt();
    const { outcome } = await pending.userChoice;
    return outcome === 'accepted';
  } catch {
    return false;
  } finally {
    changed();
  }
}
