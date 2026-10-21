import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Field } from '@/components/ui/input';
import { Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { getApi } from '@/data/backend';
import { ApiError } from '@/data/http';
import { t } from '@/i18n';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-errors';
import { notify } from '@/lib/dialog';
import { useTheme } from '@/theme';

/**
 * THE OTHER END OF A PASSWORD RESET LINK.
 *
 * Somebody forgot their password, asked the person who runs the family, and
 * was handed this link. They are not signed in - that is the whole reason
 * they are here - so this screen asks the server one thing before anything
 * else: is the link still good. A form that takes a new password and only
 * then says "expired" wastes the one bit of effort they were willing to make.
 *
 * Saving signs them out everywhere, on purpose (password-reset.service.ts),
 * so the screen ends at sign-in rather than inside the app.
 */
export default function ResetPassword() {
  const theme = useTheme();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();

  const [valid, setValid] = useState<boolean | null>(() => (getApi() ? null : false));
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const api = getApi();
    if (!api || !token) return;

    let cancelled = false;
    api
      .checkPasswordReset(token)
      .then((answer) => {
        if (!cancelled) setValid(answer.valid);
      })
      .catch(() => {
        if (!cancelled) setValid(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const problem = !tried
    ? undefined
    : password.length < MIN_PASSWORD_LENGTH
      ? t('auth.errorWeakPassword')
      : password !== repeat
        ? t('reset.mismatch')
        : undefined;

  async function save() {
    // Pressable always, and the press explains - see lib/form.ts.
    setTried(true);
    if (password.length < MIN_PASSWORD_LENGTH || password !== repeat) return;

    const api = getApi();
    if (!api || !token) return;

    setSaving(true);
    try {
      await api.completePasswordReset(token, password);
      notify(t('reset.title'), t('reset.done'));
      router.replace('/(auth)/sign-in');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'reset_link_invalid') {
        setValid(false);
      } else {
        notify(t('reset.title'), error instanceof ApiError ? error.message : t('auth.errorGeneric'));
      }
    } finally {
      setSaving(false);
    }
  }

  if (valid === null) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.color.primary} />
        </View>
      </Screen>
    );
  }

  if (!valid) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.lg }}>
          <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
            <Icon name="warning" size={40} tone="muted" />
            <Text variant="title" align="center">
              {t('reset.invalidTitle')}
            </Text>
            <Text variant="body" tone="muted" align="center">
              {t('auth.errorResetInvalid')}
            </Text>
          </View>
          <Button label={t('reset.goToSignIn')} onPress={() => router.replace('/(auth)/sign-in')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.xl }}
      >
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="title">{t('reset.title')}</Text>
          <Text variant="body" tone="muted">
            {t('reset.subtitle')}
          </Text>
        </View>

        <View style={{ gap: theme.spacing.lg }}>
          <Field
            label={t('reset.newPassword')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            autoFocus
          />
          <Field
            label={t('reset.repeat')}
            value={repeat}
            onChangeText={setRepeat}
            secureTextEntry
            autoComplete="new-password"
            error={problem}
          />
        </View>

        <Button label={t('reset.save')} size="lg" loading={saving} onPress={() => void save()} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
