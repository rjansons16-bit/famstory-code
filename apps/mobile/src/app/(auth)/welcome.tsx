import { Link, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import type { ReactNode } from 'react';
import { Linking, Platform, View } from 'react-native';

import { Appear } from '@/components/ui/appear';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { LanguageSwitch } from '@/components/ui/language-switch';
import { Card, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { Wordmark } from '@/components/ui/wordmark';
import { isLive } from '@/data/backend';
import { useApp } from '@/data/store';
import { t, type TextKey } from '@/i18n';
import { canLeaveDemo, leaveDemo } from '@/lib/demo-exit';
import { install, useDeviceKind, useInstallOffer, useSecurePage } from '@/lib/install';
import { APP_STORE_URL, PLAY_STORE_URL, SITE_ORIGIN } from '@/lib/site';
import { useTheme } from '@/theme';

/**
 * WELCOME - the first screen, as the design draws it
 * (`design/screens/design_image_22.png`, docs/07-IMPROVEMENTS.md item 40).
 *
 * The mark at the top; in the middle, one sentence and the promise that
 * matters most to a family deciding whether to trust this with their
 * children's photographs; at the bottom, exactly two ways on. The placeholder
 * it replaces had three sign-in buttons, two of which (Google, Apple) only led
 * to the third on the web.
 *
 * This is the only screen where the product explains itself, and the study
 * rates "insufficient differentiation" an elevated risk: it promises the
 * family story, privacy and permanence - not productivity, not a calendar.
 *
 * IN A BROWSER it is also the page somebody lands on from a search for
 * FamStory (docs/07-IMPROVEMENTS.md item 83), so under the same first screen
 * it says what the app does and offers it to install - on a computer or a
 * phone, as an app of its own (lib/install.web.ts). It is the one page whose
 * pre-rendered HTML carries the page itself (PRERENDERED in app/_layout.tsx),
 * which is what a search engine reads.
 *
 * The language can be changed here, at the top: before there is a profile,
 * this is the only place anybody could (components/ui/language-switch.tsx).
 * On the demo the page says in so many words that nothing made there is
 * kept - somebody who named a family on it and found the Bergs after a
 * reload had no way to know (2026-09-28).
 *
 * It opens moving (2026-09-30): the mark comes together, and the name, the
 * promise and the doors rise in after it, one after another - the first
 * impression of somebody who arrived from a search (components/ui/appear.tsx).
 *
 * The same day it stopped being the app's front door: opened as an app,
 * FamStory opens on its sign-in, as other apps do (app/index.tsx). This is
 * the page of a browser - somebody from a search - and it says so: what the
 * app is, and how to have it on a computer or a phone (GetCard).
 */
export default function Welcome() {
  const theme = useTheme();
  const router = useRouter();
  const signIn = useApp((s) => s.signIn);

  // With a server, both are doors to the form; on the sample family (the
  // demo, design review), "Get started" walks through onboarding and "I
  // already have an account" is the sign-in with the Bergs' address in it.
  async function start() {
    if (isLive()) {
      router.push('/(auth)/sign-in?mode=register');
      return;
    }
    await signIn('email', { newUser: true });
    router.replace('/(onboarding)/about-you');
  }

  // The sign-in either way; on the demo it has the sample family's address
  // filled in, so it is one press to the Bergs, as the app's own door is.
  function returning() {
    router.push('/(auth)/sign-in');
  }

  const promise = (
    <View style={{ gap: theme.spacing.md, alignItems: 'center' }}>
      <Text variant="hero" align="center">
        {t('auth.heroTitle')}
      </Text>
      <Text variant="body" tone="muted" align="center">
        {t('auth.heroSubtitle')}
      </Text>
    </View>
  );

  const doors = (
    <View style={{ gap: theme.spacing.md }}>
      <Button label={t('auth.getStarted')} size="lg" onPress={() => void start()} />
      <Touchable
        accessibilityRole="button"
        onPress={returning}
        give="row"
        hitSlop={8}
        style={{ alignSelf: 'center', paddingVertical: theme.spacing.sm }}
      >
        <Text variant="body" tone="primary" align="center">
          {t('auth.haveAccountButton')}
        </Text>
      </Touchable>
      {isLive() ? null : (
        <View style={{ gap: theme.spacing.xs, alignItems: 'center' }}>
          <Text variant="caption" tone="muted" align="center">
            {t('demo.notice')}
          </Text>
          {/* ...and the way out of it, to a family of their own. */}
          {canLeaveDemo() ? (
            <Touchable
              accessibilityRole="link"
              onPress={() => leaveDemo('welcome')}
              give="row"
              hitSlop={8}
              style={{ paddingVertical: theme.spacing.xs }}
            >
              <Text variant="caption" tone="primary" align="center">
                {t('demo.startReal')}
              </Text>
            </Touchable>
          ) : null}
        </View>
      )}
    </View>
  );

  if (Platform.OS !== 'web') {
    return (
      <Screen edges={['top', 'bottom']}>
        <LanguageSwitch />
        <View style={{ flex: 1, justifyContent: 'space-between', paddingVertical: theme.spacing.xl }}>
          <Wordmark animate />
          <Appear index={1}>{promise}</Appear>
          <Appear index={2}>{doors}</Appear>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Head>
        <title>{t('seo.title')}</title>
        {SITE_ORIGIN ? <link rel="canonical" href={`${SITE_ORIGIN}/welcome`} /> : null}
      </Head>

      <LanguageSwitch />

      <View style={{ gap: theme.spacing.xxl, paddingBottom: theme.spacing.xxl }}>
        <Wordmark animate />
        <Appear index={1}>{promise}</Appear>
        <Appear index={2}>{doors}</Appear>
      </View>

      <Appear index={3}>
        <Features />
      </Appear>
      <Appear index={4}>
        <GetCard />
      </Appear>

      <View style={{ gap: theme.spacing.sm, paddingVertical: theme.spacing.lg }}>
        <Text variant="caption" tone="muted" align="center">
          {t('landing.privacyNote')}
        </Text>
        {/* Real links: on the web this page is the front door a search engine
            reads, and the stores ask for the policy to be one click away. */}
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: theme.spacing.lg }}
        >
          <Link href="/legal/privacy">
            <Text variant="caption" tone="primary">
              {t('legal.privacy')}
            </Text>
          </Link>
          <Link href="/legal/terms">
            <Text variant="caption" tone="primary">
              {t('legal.terms')}
            </Text>
          </Link>
          <Link href="/support">
            <Text variant="caption" tone="primary">
              {t('support.link')}
            </Text>
          </Link>
        </View>
      </View>
    </Screen>
  );
}

/**
 * "Get FamStory": on a computer and on a phone, from the browser, as an app
 * of its own - the stores come later. Where this browser can install it, a
 * button does it; everywhere else the card says how, since somebody reading
 * it on a phone may want it on the computer too, and the other way round
 * (the owner, 2026-09-30: "and that it can be had on a computer as well").
 */
function GetCard() {
  const theme = useTheme();
  const offer = useInstallOffer();
  const device = useDeviceKind();
  const secure = useSecurePage();
  const here = offer === 'prompt' ? (device === 'desktop' ? 'computer' : 'phone') : null;

  return (
    <Card>
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="cardTitle">{t('landing.getTitle')}</Text>
          <Text variant="body" tone="muted">
            {t('install.hint')}
          </Text>
        </View>

        {offer === 'done' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Icon name="check" tone="primary" size={18} />
            <Text variant="body" style={{ flex: 1 }}>
              {t('install.installed')}
            </Text>
          </View>
        ) : null}

        <Way icon="desktop" title={t('landing.computerTitle')}>
          {here === 'computer' ? (
            <Button label={t('landing.computerButton')} icon="download" onPress={() => void install()} />
          ) : (
            <>
              <Text variant="body">{t('landing.computerHow')}</Text>
              <Text variant="body" tone="muted">
                {t('landing.computerMac')}
              </Text>
            </>
          )}
        </Way>

        <Way icon="phone" title={t('landing.phoneTitle')}>
          {/* The stores first, once the app is in them (lib/site.ts). */}
          {APP_STORE_URL ? (
            <Button
              label={t('landing.appStore')}
              variant="secondary"
              onPress={() => void Linking.openURL(APP_STORE_URL)}
            />
          ) : null}
          {PLAY_STORE_URL ? (
            <Button
              label={t('landing.googlePlay')}
              variant="secondary"
              onPress={() => void Linking.openURL(PLAY_STORE_URL)}
            />
          ) : null}
          {here === 'phone' ? (
            <Button label={t('landing.phoneButton')} icon="download" onPress={() => void install()} />
          ) : null}
          <Text variant="body">{t('landing.phoneIos')}</Text>
          <Text variant="body">{t('landing.phoneAndroid')}</Text>
        </Way>

        {/* The laptop's own address on the local network is plain http, from
            which no browser installs anything; said, rather than letting the
            steps above fail without a reason. */}
        {secure ? null : (
          <Text variant="caption" tone="muted">
            {t('landing.needsHttps')}
          </Text>
        )}

        {APP_STORE_URL || PLAY_STORE_URL ? null : (
          <Text variant="caption" tone="muted">
            {t('landing.stores')}
          </Text>
        )}
      </View>
    </Card>
  );
}

/** One way to have it: an icon, what it is for, and how. */
function Way({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
      <Icon name={icon} tone="primary" />
      <View style={{ flex: 1, gap: theme.spacing.sm }}>
        <Text variant="heading">{title}</Text>
        {children}
      </View>
    </View>
  );
}

/** What a family keeps here, one line each - the things no calendar does. */
const FEATURES: readonly { key: TextKey; icon: IconName }[] = [
  { key: 'landing.f.timeline', icon: 'timeline' },
  { key: 'landing.f.privacy', icon: 'shield' },
  { key: 'landing.f.voice', icon: 'mic' },
  { key: 'landing.f.capsule', icon: 'capsule' },
  { key: 'landing.f.surprise', icon: 'gift' },
  { key: 'landing.f.lifestory', icon: 'book' },
  { key: 'landing.f.film', icon: 'film' },
];

function Features() {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Text variant="title">{t('landing.featuresTitle')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
        {FEATURES.map((feature) => (
          <View
            key={feature.key}
            style={{
              flexGrow: 1,
              flexBasis: theme.size.landingColumn,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
            }}
          >
            <Icon name={feature.icon} tone="primary" />
            <Text variant="body" style={{ flex: 1 }}>
              {t(feature.key)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
