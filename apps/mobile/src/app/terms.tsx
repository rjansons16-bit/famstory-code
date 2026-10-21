import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { useApp } from '@/data/store';
import { t, tf } from '@/i18n';
import { LEGAL_VERSION } from '@/legal/texts';
import { notify } from '@/lib/dialog';
import { goBack, toFrontDoor } from '@/lib/navigation';
import { useTheme } from '@/theme';

/**
 * THE TERMS, ACCEPTED.
 *
 * Signing up records which version of the terms and the privacy policy the
 * sign-up screen showed (data/store.ts, the server's `termsVersion`). This
 * screen is for everybody else: an account made before that was recorded,
 * and everybody once a new version is published (docs/legal/facts.json). The
 * root sends them here after sign-in (TermsGate in app/_layout.tsx), once,
 * until they agree; both documents open from here and come back.
 *
 * Not agreeing is signing out. The service is the terms; there is no way to
 * use it without them.
 */
export default function Terms() {
  const theme = useTheme();
  const router = useRouter();
  const acceptTerms = useApp((s) => s.acceptTerms);
  const signOut = useApp((s) => s.signOut);
  const [saving, setSaving] = useState(false);

  async function onAgree() {
    setSaving(true);
    const saved = await acceptTerms();
    setSaving(false);
    if (saved) goBack(router);
    else notify(t('legal.acceptTitle'), t('legal.acceptFailed'));
  }

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.lg }}>
        <Icon name="shield" size={36} tone="primary" />
        <Text variant="display">{t('legal.acceptTitle')}</Text>
        <Text variant="body" tone="muted">
          {tf('legal.acceptBody', LEGAL_VERSION)}
        </Text>

        <View style={{ gap: theme.spacing.xs }}>
          <Button label={t('legal.terms')} variant="secondary" onPress={() => router.push('/legal/terms')} />
          <Button label={t('legal.privacy')} variant="secondary" onPress={() => router.push('/legal/privacy')} />
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Button label={t('legal.accept')} size="lg" loading={saving} onPress={() => void onAgree()} />
        <Button
          label={t('settings.signOut')}
          variant="ghost"
          disabled={saving}
          onPress={() => {
            signOut();
            toFrontDoor(router);
          }}
        />
      </View>
    </Screen>
  );
}
