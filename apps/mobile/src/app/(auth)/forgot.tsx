import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Field } from '@/components/ui/input';
import { Card, Header, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { getApi } from '@/data/backend';
import { ApiError } from '@/data/http';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';
import { useTheme } from '@/theme';

/**
 * "FORGOT YOUR PASSWORD?"
 *
 * Where the server has a mail provider, a link to the account's own address
 * (api identity/password-reset.service.ts): one hour, once. The answer is the
 * same whether or not the address has an account, so this screen never says
 * which - "if there is an account, the link is on its way".
 *
 * Where it has none - the laptop's LAN host, a server before its provider is
 * set up - the way that always worked: the family admin makes a link
 * (family/member/[id].tsx). Asked of the server when the screen opens, so
 * nobody types an address only to be told it cannot be used.
 */
export default function Forgot() {
  const theme = useTheme();
  const router = useRouter();
  const { email: typed } = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState(typeof typed === 'string' ? typed : '');
  // null while the server is asked which way there is.
  const [byEmail, setByEmail] = useState<boolean | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'invalid' | 'failed'>('idle');

  useEffect(() => {
    const api = getApi();
    if (!api) {
      setByEmail(false);
      return;
    }
    let current = true;
    api
      .passwordResetOptions()
      .then((options) => current && setByEmail(options.byEmail))
      .catch(() => current && setByEmail(false));
    return () => {
      current = false;
    };
  }, []);

  async function send() {
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setState('invalid');
      return;
    }
    const api = getApi();
    if (!api) return;
    setState('sending');
    try {
      await api.requestPasswordReset(address);
      setState('sent');
    } catch (error) {
      // The provider went away since the screen asked: the admin's way, then.
      if (error instanceof ApiError && error.code === 'mail_unavailable') {
        setByEmail(false);
        setState('idle');
        return;
      }
      setState('failed');
    }
  }

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header title={t('forgot.title')} onBack={() => goBack(router)} />

      {byEmail === null ? <ActivityIndicator color={theme.color.primary} /> : null}

      {byEmail === false ? (
        <Card elevation="flat">
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <Icon name="family" tone="muted" />
            <Text variant="body" style={{ flex: 1 }}>
              {t('auth.forgotBody')}
            </Text>
          </View>
        </Card>
      ) : null}

      {byEmail && state === 'sent' ? (
        <View style={{ gap: theme.spacing.lg }}>
          <Card elevation="flat">
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <Icon name="mail" tone="primary" />
              <Text variant="body" style={{ flex: 1 }}>
                {t('forgot.sent')}
              </Text>
            </View>
          </Card>
          <Button label={t('forgot.backToSignIn')} variant="secondary" onPress={() => goBack(router)} />
        </View>
      ) : null}

      {byEmail && state !== 'sent' ? (
        <View style={{ gap: theme.spacing.lg }}>
          <Text variant="body" tone="muted">
            {t('forgot.subtitle')}
          </Text>
          <Field
            label={t('auth.email')}
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (state === 'invalid' || state === 'failed') setState('idle');
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoFocus={!email}
            returnKeyType="send"
            onSubmitEditing={() => void send()}
            error={state === 'invalid' ? t('auth.errorInvalidEmail') : undefined}
          />
          {state === 'failed' ? (
            <Text variant="body" tone="danger" accessibilityRole="alert">
              {t('forgot.failed')}
            </Text>
          ) : null}
          <Button label={t('forgot.send')} loading={state === 'sending'} onPress={() => void send()} />
        </View>
      ) : null}
    </Screen>
  );
}
