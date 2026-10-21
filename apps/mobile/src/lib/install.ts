/**
 * INSTALLING THE APP from inside the app.
 *
 * Only the web build can do this - the browser installs a page that has a
 * manifest as an app of its own (./install.web.ts). A phone app is installed
 * from a store before any of this code is on the phone, so here there is
 * never anything to offer.
 */

import { Platform } from 'react-native';

/**
 * What this device can do about installing the app, right now:
 *   none   - nothing to offer
 *   prompt - a button can open the browser's own install prompt
 *   ios    - Safari on an iPhone or iPad: added by hand, from the Share menu
 *   done   - installed: this is the installed app, or it has just been installed
 */
export type InstallOffer = 'none' | 'prompt' | 'ios' | 'done';

export function startInstallSupport(): void {}

export function useInstallOffer(): InstallOffer {
  return 'none';
}

/** Opens the browser's install prompt; true when the person said yes. */
export async function install(): Promise<boolean> {
  return false;
}

/**
 * Whether this is FamStory opened as an app, rather than a site in a
 * browser: the front door differs (app/index.tsx). A phone build always is.
 */
export function openedAsApp(): boolean {
  return true;
}

/** Which kind of device, for the words an install is offered in. */
export type DeviceKind = 'android' | 'ios' | 'desktop';

export function useDeviceKind(): DeviceKind {
  return Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'desktop';
}

/** Whether a browser would install from this address at all: only from https, or the machine itself. */
export function useSecurePage(): boolean {
  return true;
}
