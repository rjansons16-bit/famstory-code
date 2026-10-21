import type { useRouter } from 'expo-router';

import { frontDoor } from './routes';

type Router = ReturnType<typeof useRouter>;

/**
 * BACK - or, on a screen that has nothing behind it, the front of the app.
 *
 * In a browser a screen can be the first thing in its tab: reloaded, opened
 * from a link or an address typed in. There `router.back()` does nothing at
 * all, so the back arrow was dead and "Save" on a reloaded composer saved and
 * stayed (found pressing everything before a presentation, 2026-10-01). "/"
 * is the entry point here, not the timeline: these screens sit beside the
 * tabs, not in them, and from there it decides - the family for somebody
 * signed in, the front door for anybody else (app/index.tsx).
 */
export function goBack(router: Router): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * TO THE FRONT DOOR, with nothing of the family behind it: after a sign-out
 * every screen that was open is let go first. Replacing only the screen on
 * top left the family's tabs under the sign-in, signed out, with a back arrow
 * to them - signing out from Settings, which sits over the tabs.
 */
export function toFrontDoor(router: Router): void {
  if (router.canDismiss()) router.dismissAll();
  router.replace(frontDoor());
}
