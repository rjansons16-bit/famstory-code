import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { QrCode } from '@/components/family/qr-code';
import { Button } from '@/components/ui/button';
import { Card, Header, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Wordmark } from '@/components/ui/wordmark';
import { getApi } from '@/data/backend';
import { useApp } from '@/data/store';
import { track } from '@/domain/analytics';
import { isClosedCapsule } from '@/domain/capsules';
import { isPendingSurprise } from '@/domain/surprises';
import { t } from '@/i18n';
import { notify } from '@/lib/dialog';
import { goBack } from '@/lib/navigation';
import { shareText } from '@/lib/share';
import { useTheme } from '@/theme';

/**
 * AN HEIRLOOM STICKER (docs/07-IMPROVEMENTS.md item 82).
 *
 * The story of a thing - grandfather's watch, the painting in the hall - told
 * once in the app, with its photographs and a voice, and then printed as a
 * square to stick on the thing itself. Whoever scans it in thirty years hears
 * the story without an account. It is the one link that carries a voice
 * (guest-links.service.ts on the server), so making it says so first, and it
 * can be withdrawn like any guest link.
 */
export default function HeirloomSticker() {
  const theme = useTheme();
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const event = useApp((s) => s.events.find((e) => e.id === eventId));
  const family = useApp((s) => s.family);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const live = Boolean(getApi());
  const notYet = !!event && (isClosedCapsule(event) || isPendingSurprise(event));

  async function make() {
    const api = getApi();
    if (!api || !family || !event) return;
    setBusy(true);
    try {
      const made = await api.createGuestLink(family.id, event.id, 0, true);
      setUrl(made.url);
      track({ name: 'heirloom_sticker_created' });
    } catch (error) {
      notify(t('sticker.title'), error instanceof Error ? error.message : t('auth.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  function print() {
    // A browser prints the page, and the sticker is the page. A phone has no
    // print dialog to reach from here, so it hands the link on instead.
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.print();
    else if (url) void shareText(url, t('sticker.title'));
  }

  if (!event) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="—" onBack={() => goBack(router)} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header title={t('sticker.title')} onBack={() => goBack(router)} />

      {!url ? (
        <>
          <Text variant="body" tone="muted">
            {t('sticker.hint')}
          </Text>
          <Card elevation="flat">
            <Text variant="body">{t('sticker.warning')}</Text>
          </Card>
          {notYet ? (
            <Text variant="body">{t('sticker.notYet')}</Text>
          ) : !live ? (
            <Text variant="body">{t('guest.onlyLive')}</Text>
          ) : (
            <Button label={t('sticker.make')} icon="qr" loading={busy} onPress={() => void make()} />
          )}
        </>
      ) : (
        <>
          {/* The sticker itself: what gets printed and stuck on the thing. */}
          <Card>
            <View style={{ alignItems: 'center', gap: theme.spacing.lg, paddingVertical: theme.spacing.md }}>
              <Wordmark />
              <Text variant="title" align="center">
                {event.title}
              </Text>
              <QrCode value={url} size={220} />
              <Text variant="heading" align="center">
                {t('sticker.scan')}
              </Text>
              {family ? (
                <Text variant="caption" tone="muted" align="center">
                  {family.name}
                </Text>
              ) : null}
            </View>
          </Card>
          <Button label={t('sticker.print')} icon="print" onPress={print} />
        </>
      )}
    </Screen>
  );
}
