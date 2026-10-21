import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { useApp } from '@/data/store';
import { frontDoor } from '@/lib/routes';

/**
 * Entry point. Three states:
 *   no session            -> the front door
 *   session, no family    -> onboarding
 *   session with a family -> the app
 *
 * Nothing is decided until the persisted session has been read. Redirecting
 * first and rehydrating second would sign the user out on every launch for one
 * frame — and the router would have already navigated away by the time the
 * session came back.
 *
 * THE FRONT DOOR depends on how FamStory was opened (2026-09-30, the owner:
 * the app should open on its logo and ask to sign in, as other apps do; the
 * page found on Google should tell what the app is and offer it for a
 * computer). Opened as an app - a phone build, the web app installed, the
 * phone view's app - it is the sign-in under the mark; in a browser it is
 * the welcome page, what FamStory is and how to install it (frontDoor in
 * lib/routes.ts; lib/install.web.ts says which). The demo is no different:
 * its sign-in has the sample family's address filled in, and "Sign in"
 * opens the Bergs.
 */
export default function Index() {
  const hydrated = useApp((s) => s.hydrated);
  const session = useApp((s) => s.session);
  const onboardingComplete = useApp((s) => s.onboardingComplete);

  // Reading the keychain takes a few milliseconds. A blank screen for that long
  // is invisible; a wrong redirect is not.
  if (!hydrated) return <View />;

  if (!session) return <Redirect href={frontDoor()} />;
  if (!onboardingComplete) return <Redirect href="/(onboarding)/about-you" />;
  return <Redirect href="/(tabs)" />;
}
