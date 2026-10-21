import { openedAsApp } from './install';

/**
 * WHICH PAGES OPEN WITHOUT AN ACCOUNT: the front door and its forms, an
 * invitation, a guest link, a one-time password link, the privacy policy
 * and terms, which have to be readable before anybody agrees to them, and
 * support, which is where somebody who has lost the app goes to delete their
 * account (the stores ask for that page). Every other page needs
 * somebody signed in, and one opened without - a link to an event pasted into
 * a chat, the composer from a home-screen shortcut, a bookmark made before
 * signing out - is sent to the front door (AccountGate in app/_layout.tsx).
 *
 * By the first segment of the route, as expo-router's `useSegments` gives it:
 * `[]` is the entry point itself (app/index.tsx), which decides for itself.
 */
const OPEN_WITHOUT_ACCOUNT = new Set(['(auth)', 'join', 'guest', 'reset', 'legal', 'support']);

export function opensWithoutAccount(segments: readonly string[]): boolean {
  const first = segments[0];
  return first === undefined || OPEN_WITHOUT_ACCOUNT.has(first);
}

/**
 * WHERE SOMEBODY WITHOUT AN ACCOUNT IS SENT: the sign-in in the app, the
 * welcome page in a browser (app/index.tsx says why the two differ).
 *
 * Never "/": from inside the tabs that address is the timeline - the tabs'
 * own index has it too - so a sign-out sent there landed on an empty
 * timeline, signed out, and only a second press reached the front door (the
 * owner, 2026-10-01: "the first time it throws me to the start, only the
 * second time can I sign out").
 */
export function frontDoor(): '/(auth)/sign-in' | '/(auth)/welcome' {
  return openedAsApp() ? '/(auth)/sign-in' : '/(auth)/welcome';
}
