import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Card, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { getApi } from '@/data/backend';
import { useApp } from '@/data/store';
import { track } from '@/domain/analytics';
import { t, tf } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * THE OTHER END OF AN INVITATION LINK.
 *
 * Somebody was sent a link, tapped it, and is now here - possibly without an
 * account, possibly having never heard of this product. Three things have to
 * happen on this screen, in this order, or they leave:
 *
 *   1. SAY WHOSE FAMILY IT IS. "Join a family" means nothing; "The Bergs" is
 *      the grandchildren. The preview endpoint is public for exactly this, and
 *      it deliberately returns the name and the role and nothing else - the
 *      members and the events are not somebody's to see before they join.
 *   2. REMEMBER THE CODE. Signing up walks away from this screen and comes
 *      back through onboarding; the code has to survive that walk or the
 *      person ends up creating a second, empty family - which is the one
 *      outcome that cannot be undone from inside the app.
 *   3. ONE BUTTON. Not a form with a code in it: the code is in the link.
 */
export default function JoinByLink() {
  const theme = useTheme();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();

  const session = useApp((s) => s.session);
  const family = useApp((s) => s.family);
  const hydrated = useApp((s) => s.hydrated);
  const joinFamily = useApp((s) => s.joinFamily);
  const completeOnboarding = useApp((s) => s.completeOnboarding);
  const rememberInvite = useApp((s) => s.rememberInvite);

  const [familyName, setFamilyName] = useState<string | null>(null);
  // Only a live server has a preview to wait for; on sample data there is
  // nothing to ask, so the screen starts ready rather than flipping to it.
  const [checking, setChecking] = useState(() => Boolean(getApi() && code));
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (code) rememberInvite(code);
  }, [code, rememberInvite]);

  useEffect(() => {
    const api = getApi();
    if (!api || !code) return;

    let cancelled = false;
    api
      .previewInvitation(code)
      .then((preview) => {
        if (!cancelled) setFamilyName(preview.familyName);
      })
      // A code that is wrong, used or expired says so on the button rather
      // than here: the person is looking at a screen they did not choose, and
      // an error before a sentence of explanation is just a wall.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  async function join() {
    if (!code) return;

    setJoining(true);
    const joined = await joinFamily(code);
    setJoining(false);
    if (!joined) return;

    completeOnboarding();
    track({ name: 'invitation_accepted', role: 'member' });
    router.replace('/(tabs)');
  }

  if (!hydrated || checking) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.color.primary} />
        </View>
      </Screen>
    );
  }

  const name = familyName ?? t('join.aFamily');

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.xl }}>
        <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
          <Icon name="family" size={40} tone="primary" />
          <Text variant="display" align="center">
            {tf('join.title', name)}
          </Text>
          <Text variant="body" tone="muted" align="center">
            {t('join.subtitle')}
          </Text>
        </View>

        <Card>
          <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
            <Text variant="caption" tone="muted">
              {t('family.inviteByCode')}
            </Text>
            <Text variant="heading" tone="primary">
              {code}
            </Text>
          </View>
        </Card>

        {/* Already in a family: joining a second one is not something the app
            can do yet, and pretending otherwise would lose the first. */}
        {family ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="body" tone="muted" align="center">
              {tf('join.alreadyInFamily', family.name)}
            </Text>
            <Button label={t('join.openApp')} onPress={() => router.replace('/(tabs)')} />
          </View>
        ) : session ? (
          <Button label={tf('join.join', name)} loading={joining} onPress={() => void join()} />
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="body" tone="muted" align="center">
              {t('join.needAccount')}
            </Text>
            <Button label={t('auth.signUp')} onPress={() => router.replace('/(auth)/welcome')} />
          </View>
        )}
      </View>
    </Screen>
  );
}
