import { Link, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Card, Header, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { t, tf } from '@/i18n';
import { SUPPORT_EMAIL, writeToUs } from '@/lib/contact';
import { goBack } from '@/lib/navigation';
import { useTheme } from '@/theme';

/**
 * SUPPORT: where to write, how to report, how to block, how to leave.
 *
 * Both stores ask for a page like this outside the app (docs/store/listing.md):
 * Apple's Support URL, and Google's account-deletion page, which has to work
 * for somebody who no longer has the app - `/support#delete`. So it opens
 * without an account (lib/routes.ts), like the privacy policy and the terms.
 */
export default function Support() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Head>
        <title>{`${t('support.title')} · FamStory`}</title>
      </Head>
      <Header title={t('support.title')} onBack={() => goBack(router)} />

      <Text variant="body" tone="muted">
        {t('support.lead')}
      </Text>

      <Section title={t('support.writeTitle')}>
        {SUPPORT_EMAIL ? (
          <Touchable accessibilityRole="link" onPress={writeToUs}>
            <Text variant="body" tone="primary">
              {SUPPORT_EMAIL}
            </Text>
          </Touchable>
        ) : (
          <Text variant="body" tone="muted">
            {t('support.writeLater')}
          </Text>
        )}
      </Section>

      <Section title={t('support.reportTitle')}>
        <Text variant="body">{t('support.reportBody')}</Text>
      </Section>

      <Section title={t('support.blockTitle')}>
        <Text variant="body">{t('support.blockBody')}</Text>
      </Section>

      {/* Google's account-deletion page is this section: /support#delete. */}
      <View nativeID="delete">
        <Section title={t('support.deleteTitle')}>
          <Text variant="body">{t('support.deleteBody')}</Text>
          {SUPPORT_EMAIL ? (
            <Text variant="body">{tf('support.deleteWithout', SUPPORT_EMAIL)}</Text>
          ) : null}
        </Section>
      </View>

      {/* Real links, as on the welcome page: a search engine reads this one too. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
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
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Card elevation="flat">
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {children}
      </View>
    </Card>
  );
}
