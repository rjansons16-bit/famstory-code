import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { SwitchRow } from '@/components/ui/input';
import { Card, Header, Row, SectionHeader, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { isLive } from '@/data/backend';
import { useApp } from '@/data/store';
import { DELETION_GRACE_DAYS } from '@/domain/account';
import { t, tf } from '@/i18n';
import { SUPPORT_EMAIL, writeToUs } from '@/lib/contact';
import { confirm, notify } from '@/lib/dialog';
import { saveFile } from '@/lib/download';
import { goBack, toFrontDoor } from '@/lib/navigation';
import { openPushSettings, pushAvailable, pushPermission, type PushPermission } from '@/lib/push';
import { useTheme } from '@/theme';

export default function Settings() {
  const theme = useTheme();
  const router = useRouter();

  const signOut = useApp((s) => s.signOut);
  const exportMyData = useApp((s) => s.exportMyData);
  const deleteMyAccount = useApp((s) => s.deleteMyAccount);

  // The account's own switches. These were local state once: flipped off,
  // they came back on the next visit and the server never heard of them.
  const user = useApp((s) => s.session?.user);
  const family = useApp((s) => s.family);
  const setHealthConsent = useApp((s) => s.setHealthConsent);
  const setNotify = useApp((s) => s.setNotify);
  const registerPush = useApp((s) => s.registerPush);

  // What the phone says about notifications, read again when the app comes
  // back from the phone's own settings - where a "no" can become a "yes".
  const [push, setPush] = useState<PushPermission | null>(null);
  useEffect(() => {
    if (!pushAvailable()) return;
    const read = () => void pushPermission().then(setPush);
    read();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });
    return () => subscription.remove();
  }, []);

  async function onPushEnable() {
    setPush(await registerPush(true));
  }

  async function onExport() {
    const file = await exportMyData();
    // null means the server refused and the banner at the root already says so.
    if (!file) return;

    const day = new Date().toISOString().slice(0, 10);
    const saved = saveFile(`famstory-export-${day}.json`, file, 'application/json');

    notify(
      t('settings.exportData'),
      saved ? t('settings.exportSaved') : t('settings.exportOnlyOnWeb'),
    );
  }

  async function onHealthConsent(on: boolean) {
    if (on) {
      const yes = await confirm({
        title: t('health.consentTitle'),
        message: t('health.consentBody'),
        confirmLabel: t('health.agree'),
        cancelLabel: t('common.cancel'),
      });
      if (!yes) return;
    }
    if (!(await setHealthConsent(on))) notify(t('health.consentTitle'), t('health.failed'));
  }

  async function onDelete() {
    // A subscription is the store's, not the account's: it keeps renewing.
    const store = family?.plan === 'premium' ? family.subscription?.store : undefined;
    const bought = store === 'app_store' || store === 'play_store';
    const message = tf('settings.deleteAccountConfirm', DELETION_GRACE_DAYS);
    const sure = await confirm({
      title: t('settings.deleteAccount'),
      message: bought ? `${message}\n\n${t('settings.deleteKeepsSubscription')}` : message,
      confirmLabel: t('settings.deleteAccount'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!sure) return;

    // Only says it happened if it happened: signOut() runs inside, so by the
    // time this message is read the app is back on the welcome screen.
    if (await deleteMyAccount()) {
      notify(t('settings.deleteAccount'), tf('settings.deleteAccountStarted', DELETION_GRACE_DAYS));
    }
  }

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header title={t('settings.title')} onBack={() => goBack(router)} />

      {/* --- Notifications --- */}
      <View>
        <SectionHeader title={t('settings.notifications')} />
        <Card elevation="flat">
          <SwitchRow
            title={t('settings.notifyReminders')}
            value={user?.notifyReminders !== false}
            onValueChange={(on) => setNotify('reminders', on)}
          />
          <View style={{ height: 1, backgroundColor: theme.color.border }} />
          <SwitchRow
            title={t('settings.notifyEvents')}
            value={user?.notifyEvents !== false}
            onValueChange={(on) => setNotify('events', on)}
          />
          <View style={{ height: 1, backgroundColor: theme.color.border }} />
          <SwitchRow
            title={t('settings.notifyComments')}
            value={user?.notifyComments !== false}
            onValueChange={(on) => setNotify('comments', on)}
          />
        </Card>
        <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
          {t('settings.notifyHint')}
        </Text>
      </View>

      {/* --- On this phone: whether the switches above also reach the lock
          screen (lib/push.ts). Only on a phone with a server to tell. --- */}
      {push && push !== 'unavailable' && isLive() ? (
        <View>
          <SectionHeader title={t('settings.pushTitle')} />
          <Card elevation="flat">
            <Row
              title={push === 'granted' ? t('settings.pushOn') : t('settings.pushOff')}
              subtitle={push === 'denied' ? t('settings.pushDeniedHint') : undefined}
              left={<Icon name="bell" tone="muted" />}
              right={
                push === 'undetermined' ? (
                  <Button label={t('settings.pushEnable')} variant="secondary" fullWidth={false} onPress={() => void onPushEnable()} />
                ) : undefined
              }
              onPress={push === 'denied' ? openPushSettings : undefined}
            />
          </Card>
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
            {t('settings.pushHint')}
          </Text>
        </View>
      ) : null}

      {/* --- Privacy --- */}
      <View>
        <SectionHeader title={t('settings.privacy')} />
        <Card>
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <Icon name="shield" tone="primary" />
            <Text variant="body" tone="muted" style={{ flex: 1 }}>
              {t('settings.privacyBody')}
            </Text>
          </View>
        </Card>

        <View style={{ height: theme.spacing.sm }} />

        <Card elevation="flat">
          {/* No plan check. Data portability is a right, and the paywall
              belongs to the DESIGNED chronicle (PDF, photo book) - the row
              used to send free users to the paywall, which is the one thing
              docs/06-PRIVACY-GDPR.md says this must never do. */}
          <Row
            title={t('settings.exportData')}
            subtitle={t('settings.exportBody')}
            left={<Icon name="download" tone="muted" />}
            right={<Icon name="forward" size={16} tone="muted" />}
            onPress={() => void onExport()}
          />
        </Card>

        {/* Consent to health information (GDPR Art. 9), withdrawn as easily
            as it was given. Only where the server keeps it. */}
        {user?.healthConsent !== undefined ? (
          <>
            <View style={{ height: theme.spacing.sm }} />
            <Card elevation="flat">
              <SwitchRow
                title={t('settings.healthConsent')}
                value={user.healthConsent}
                onValueChange={(on) => void onHealthConsent(on)}
              />
            </Card>
            <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
              {t('settings.healthConsentHint')}
            </Text>
          </>
        ) : null}
      </View>

      {/* --- Legal: the privacy policy and the terms, and who to write to --- */}
      <View>
        <SectionHeader title={t('legal.section')} />
        <Card elevation="flat">
          <Row
            title={t('legal.privacy')}
            left={<Icon name="shield" tone="muted" />}
            right={<Icon name="forward" size={16} tone="muted" />}
            onPress={() => router.push('/legal/privacy')}
          />
          <View style={{ height: 1, backgroundColor: theme.color.border }} />
          <Row
            title={t('legal.terms')}
            left={<Icon name="book" tone="muted" />}
            right={<Icon name="forward" size={16} tone="muted" />}
            onPress={() => router.push('/legal/terms')}
          />
          {SUPPORT_EMAIL ? (
            <>
              <View style={{ height: 1, backgroundColor: theme.color.border }} />
              <Row
                title={t('legal.contact')}
                subtitle={SUPPORT_EMAIL}
                left={<Icon name="mail" tone="muted" />}
                onPress={writeToUs}
              />
            </>
          ) : null}
        </Card>
      </View>

      {/* --- Account --- */}
      <View>
        <SectionHeader title={t('settings.account')} />
        <Card elevation="flat">
          <Row
            title={t('settings.deleteAccount')}
            left={<Icon name="delete" tone="danger" />}
            danger
            onPress={() => void onDelete()}
          />
        </Card>
      </View>

      <Button
        label={t('settings.signOut')}
        variant="ghost"
        icon="logout"
        onPress={() => {
          signOut();
          // The sign-in in the app, the welcome page in a browser.
          toFrontDoor(router);
        }}
      />
    </Screen>
  );
}
