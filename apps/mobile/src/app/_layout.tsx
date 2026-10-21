import { Fraunces_400Regular, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  usePathname,
  useRouter,
  useSegments,
  type ErrorBoundaryProps,
} from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { ErrorBar, UndoBar } from '@/components/ui/feedback';
import { Text } from '@/components/ui/text';
import { useAppearance } from '@/data/appearance';
import { isLive } from '@/data/backend';
import { useLocale } from '@/data/locale';
import { useApp } from '@/data/store';
import { installTelemetry, reportError } from '@/data/telemetry';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useForegroundSync } from '@/hooks/use-sync';
import { t } from '@/i18n';
import { LEGAL_VERSION, legalTextsAreDrafts } from '@/legal/texts';
import { startInstallSupport } from '@/lib/install';
import { useReducedMotion } from '@/lib/motion';
import { toFrontDoor } from '@/lib/navigation';
import { onPushOpened } from '@/lib/push';
import { opensWithoutAccount } from '@/lib/routes';

import { colors, motion, useTheme } from '@/theme';

/**
 * THE PAGES WHOSE PRE-RENDERED HTML CARRIES THE PAGE ITSELF: the welcome page,
 * which is what a search engine reads and what a browser can paint before the
 * script has arrived.
 *
 * Every other page's HTML is the background alone and the page is drawn on
 * the client, because what it shows depends on what the build machine does
 * not have - the session, today's date, the size of the window - and a first
 * client render that disagrees with the HTML is a hydration failure.
 *
 * Not `/`, although a search engine may index it: its index.html is also
 * what both servers answer for every address without a file of its own - a
 * link to an event, a guest link, an invitation (tools/lan-host/static-
 * server.mjs, tools/deploy/Caddyfile). With `/` drawn into it, each of those
 * hydrated against the wrong page (React error 418). `/` itself shows nothing
 * but a redirect, so the background is all it loses.
 */
const PRERENDERED = new Set(['/welcome']);

function noSubscription(): () => void {
  return () => {};
}

/**
 * False while the page is pre-rendered and while the browser hydrates that
 * HTML, true from the next render on - and always true on a phone.
 */
function useDrawnOnClient(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const reducedMotion = useReducedMotion();
  const background = colors[scheme].background;
  // The navigators' own ground, under every screen. React Navigation's is a
  // light grey whatever the scheme, and it showed: as a light edge round a
  // dark screen drawn smaller than itself (the phone view on a computer), and
  // behind a screen sliding in. So it is the app's, in both schemes.
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors[scheme].primary,
      background,
      card: colors[scheme].surface,
      text: colors[scheme].text,
      border: colors[scheme].border,
    },
  };
  const hydrate = useApp((s) => s.hydrate);
  const lastError = useApp((s) => s.lastError);
  const dismissError = useApp((s) => s.dismissError);
  const restoreAppearance = useAppearance((s) => s.restore);
  const locale = useLocale((s) => s.locale);
  const restoreLocale = useLocale((s) => s.restore);
  const localeReady = useLocale((s) => s.restored) || Platform.OS === 'web';
  // On the web the choice is read before the first render (data/appearance.ts),
  // and waiting for it here would put an empty page into the pre-rendered HTML.
  const appearanceReady = useAppearance((s) => s.restored) || Platform.OS === 'web';

  // Put the phone down for an hour, pick it up, and the family's day is there.
  useForegroundSync();

  // The design names both faces: "Fraunces · display", "Inter · interface text".
  // Only the weights that tokens.ts actually asks for are loaded — an unloaded
  // weight is synthesised by the platform, which on a serif means smeared stems.
  //
  // expo-font's own hook, not the one the font packages export. That one says
  // "not yet" while the web pages are pre-rendered, so the HTML of every page
  // was an empty background: nothing for a search engine to read, and nothing
  // to see until the whole script had arrived. This one knows the pre-render -
  // it writes the faces into the page's HTML and answers that they are ready,
  // and in the browser it finds them there, so hydration agrees.
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  // Which page this is, for PRERENDERED above.
  const pathname = usePathname();
  const drawnOnClient = useDrawnOnClient();
  const drawNow = drawnOnClient || PRERENDERED.has(pathname);

  // The KPI events and the error reports: our own server when there is one,
  // the console when there is not (data/telemetry.ts).
  useEffect(() => installTelemetry(), []);

  // What lets a browser install the web app, on a computer or a phone
  // (lib/install.web.ts). Nothing on a phone app.
  useEffect(() => startInstallSupport(), []);

  // The page's language, for a screen reader's voice and the browser's offer
  // to translate: the pre-rendered HTML says English whatever was chosen. And
  // a page kept out of sight until it could be drawn in the chosen language
  // (+html.tsx, HOLD_FOR_LANGUAGE) is shown, now that it is.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const page = document.documentElement;
    page.lang = locale;
    if (page.getAttribute('data-locale-pending') === locale) page.removeAttribute('data-locale-pending');
  }, [locale]);

  useEffect(() => {
    // Restore the session before anything decides where to navigate.
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    void restoreAppearance();
  }, [restoreAppearance]);

  useEffect(() => {
    void restoreLocale();
  }, [restoreLocale]);

  useEffect(() => {
    // The native root view beneath the React tree. Without this, dark mode
    // flashes a light background during screen transitions and overscroll.
    void SystemUI.setBackgroundColorAsync(background);
  }, [background]);

  // Held until both faces are ready. Rendering first would show one frame in the
  // system font and then reflow — on a serif display face that jump is obvious,
  // and it lands on the family name at the top of the first screen.
  // The effects above still run: returning null mounts, it just paints nothing.
  // Same for the light-or-dark choice: a first frame in the wrong theme is a flash.
  // And on the web, every page but the front door waits for hydration to end
  // (PRERENDERED, above).
  if (!fontsLoaded || !appearanceReady || !localeReady || !drawNow) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: background }}>
        <PageHead />
      </GestureHandlerRootView>
    );
  }

  return (
    // Two things at once on this view. The background belongs here because on
    // web the body stays transparent, so in dark mode the browser's white
    // would show through behind the app. And the KEY is the language: `t()` is
    // a plain function whose results React Compiler memoises per component
    // instance, so switching language has to build new instances. This one
    // line is what carries the switch in Settings to every screen, including
    // text that a date helper produced. See i18n/index.ts.
    <GestureHandlerRootView key={locale} style={{ flex: 1, backgroundColor: background }}>
      <PageHead />
      <AccountGate />
      <TermsGate />
      <PushGate />
      <SafeAreaProvider>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <ThemeProvider value={navigationTheme}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: background },
              // Forward is to the right, and back reverses exactly what came.
              // Turned off entirely — not shortened — when the system asks for
              // reduced motion; see lib/motion.ts.
              animation: reducedMotion ? 'none' : 'slide_from_right',
              animationDuration: motion.normal,
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="(tabs)" />
            {/* The composer and the paywall interrupt rather than continue, so
                they rise from the bottom instead of sliding in from the side. */}
            <Stack.Screen
              name="event/new"
              options={{
                presentation: 'modal',
                animation: reducedMotion ? 'none' : 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="premium"
              options={{
                presentation: 'modal',
                animation: reducedMotion ? 'none' : 'slide_from_bottom',
              }}
            />
          </Stack>
        </ThemeProvider>

        {/* Mounted once, above every screen: a delete happens on the event
            detail screen but the user is back on the timeline by the time the
            offer to undo it appears. */}
        <UndoDeleteBar />

        {/* The other half of an optimistic write: what the server refused. */}
        <ErrorBar error={lastError} onDismiss={dismissError} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/*
 * The text the root itself shows lives in components of its own, below. The
 * language switch works by keying the tree on the locale (above), which
 * builds every component under the key anew - but not RootLayout, which owns
 * the key. A `t()` written in RootLayout is memoised by React Compiler once
 * and keeps the first language it was drawn in (i18n/index.ts): on the web,
 * where the page hydrates in English, the description stayed English on a
 * Latvian page, and so did "Event deleted" and "Undo".
 */

/**
 * What a browser tab, a bookmark and a shared link show. The pre-rendered
 * pages had an empty <title>, so a tab read "localhost:8081/welcome" and an
 * invitation pasted into a chat previewed as nothing. In both branches of the
 * root: the first one is what the static export writes into the HTML.
 */
function PageHead() {
  return (
    <Head>
      <title>FamStory</title>
      <meta name="description" content={t('seo.description')} />
    </Head>
  );
}

/**
 * A page that needs an account, opened without one, goes to the front door,
 * which decides where next (lib/routes.ts). Before, it drew itself around a
 * family that was not there - "Everyone in" and nothing after it - with no
 * way to sign in from it. Only once the stored session has been read: before
 * that, "nobody" is not yet known.
 */
function AccountGate() {
  const segments = useSegments();
  const router = useRouter();
  const hydrated = useApp((s) => s.hydrated);
  const signedIn = useApp((s) => !!s.session);
  const open = opensWithoutAccount(segments);

  useEffect(() => {
    if (hydrated && !signedIn && !open) toFrontDoor(router);
  }, [hydrated, signedIn, open, router]);

  return null;
}

/**
 * Somebody signed in whose account has not accepted the terms this build
 * publishes goes to app/terms.tsx - once the server has said which version
 * they have (`termsVersion` absent means not known: the sample family, an
 * older server). The documents themselves open from there, so they are not
 * sent back while reading them.
 */
function TermsGate() {
  const segments = useSegments();
  const router = useRouter();
  const termsVersion = useApp((s) => s.session?.user.termsVersion);
  const where = segments[0];
  // Never for a draft: a text with the company's details still blank is
  // nothing anybody can agree to (legal/texts.ts).
  const due =
    isLive() &&
    LEGAL_VERSION !== '' &&
    !legalTextsAreDrafts() &&
    termsVersion !== undefined &&
    termsVersion !== LEGAL_VERSION;
  const away = where === 'terms' || where === 'legal' || opensWithoutAccount(segments);

  useEffect(() => {
    if (due && !away) router.push('/terms');
  }, [due, away, router]);

  return null;
}

/**
 * PUSH (lib/push.ts). At each launch the phone's token goes to the server
 * again - a token can change - without asking anybody anything: the asking
 * happens where somebody can see why (saving an entry with a reminder,
 * Settings). And a tapped notification opens what it is about, once somebody
 * is signed in to see it.
 */
function PushGate() {
  const router = useRouter();
  const userId = useApp((s) => s.session?.user.id);
  const registerPush = useApp((s) => s.registerPush);
  // A tap that started the app arrives before the session is read from disk.
  const waiting = useRef<string | null>(null);

  useEffect(() => {
    if (userId && isLive()) void registerPush(false);
  }, [userId, registerPush]);

  useEffect(
    () =>
      onPushOpened((route) => {
        if (useApp.getState().session) router.push(route);
        else waiting.current = route;
      }),
    [router],
  );

  useEffect(() => {
    if (!userId || !waiting.current) return;
    const route = waiting.current;
    waiting.current = null;
    router.push(route);
  }, [userId, router]);

  return null;
}

function UndoDeleteBar() {
  const recentlyDeleted = useApp((s) => s.recentlyDeleted);
  const undoDelete = useApp((s) => s.undoDelete);
  const dismissUndo = useApp((s) => s.dismissUndo);

  return (
    <UndoBar
      token={recentlyDeleted?.event.id ?? null}
      message={t('event.deleted')}
      actionLabel={t('common.undo')}
      onAction={undoDelete}
      onExpire={dismissUndo}
    />
  );
}

/**
 * WHEN A SCREEN THROWS.
 *
 * Without this a rendering error is a blank page - on the web, white, with
 * nothing to press. Here it is a sentence and a way to try again, and the
 * error goes to the server's log (data/telemetry.ts) so it is known about
 * before somebody has to describe it.
 *
 * Rendered in place of the whole tree, outside the providers above, so it
 * leans on nothing they set up: plain views and the tokens.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const theme = useTheme();

  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.xl,
        backgroundColor: theme.color.background,
      }}
    >
      <Text variant="heading" align="center">
        {t('error.title')}
      </Text>
      <Text variant="body" tone="muted" align="center" style={{ maxWidth: theme.size.contentMaxWidth }}>
        {t('error.body')}
      </Text>
      <Button label={t('error.retry')} onPress={() => void retry()} />
    </View>
  );
}
