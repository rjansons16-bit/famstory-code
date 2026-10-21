import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { LanguageSwitch } from '@/components/ui/language-switch';
import { Header, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { Wordmark } from '@/components/ui/wordmark';
import { isLive } from '@/data/backend';
import { mockUser } from '@/data/mock';
import { describeError, useApp } from '@/data/store';
import { t, type TextKey } from '@/i18n';
import { authErrorMessage, formProblem } from '@/lib/auth-errors';
import { canLeaveDemo, leaveDemo } from '@/lib/demo-exit';
import { goBack } from '@/lib/navigation';
import { useTheme } from '@/theme';

/**
 * SIGN IN - and, one line under it, creating an account.
 *
 * Reached two ways. Pushed from the welcome page ("I already have an
 * account", "Get started"), under a header with the way back. And as the
 * app's own front door (app/index.tsx): opened as an app, FamStory opens
 * here, under its mark, the way apps do - nothing to go back to, and the
 * language at the top, since the welcome page, where it is otherwise changed,
 * never comes.
 *
 * On the demo (no server) the sample family's address is filled in and no
 * password is asked for: "Sign in" opens the Bergs, and "Create account"
 * walks through onboarding, where nothing made is kept.
 */
export default function SignIn() {
  const theme = useTheme();
  const router = useRouter();
  const signIn = useApp((s) => s.signIn);
  const demo = !isLive();
  // The front door: nothing came before it (index.tsx redirects here).
  const [front] = useState(() => !router.canGoBack());
  // "Get started" on the welcome screen arrives here to register; everything
  // else to sign in. One form either way, and a line under it to switch.
  const { mode: asked } = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'signIn' | 'register'>(asked === 'register' ? 'register' : 'signIn');
  const other = mode === 'register' ? 'signIn' : 'register';

  const [email, setEmail] = useState(demo ? mockUser.email : '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  /**
   * Said on this screen, under the form, rather than in the bar at the root:
   * on a phone the keyboard covers the bottom of the screen, which is exactly
   * where that bar sits. The first real sign-in attempt showed nothing at all.
   */
  const [problem, setProblem] = useState<TextKey | null>(null);

  function edit(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      // Typing is the answer to the message; leaving it up would argue with it.
      if (problem) setProblem(null);
    };
  }

  async function run(mode: 'signIn' | 'register') {
    setMode(mode);
    // Pressable always, and the press explains. A disabled button with no
    // reason beside it is how "nothing happens" happened. The demo asks
    // nothing: there is no account behind it to check against.
    const local = demo ? null : formProblem(mode, email, password);
    if (local) {
      setProblem(local);
      return;
    }

    setProblem(null);
    setLoading(true);
    try {
      await signIn('email', {
        newUser: mode === 'register',
        email: email.trim(),
        password,
      });
      router.replace(mode === 'register' ? '/(onboarding)/about-you' : '/(tabs)');
    } catch (error) {
      setProblem(authErrorMessage(describeError(error).code));
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <View style={{ gap: theme.spacing.lg }}>
      <Field
        label={t('auth.email')}
        placeholder={t('auth.emailPlaceholder')}
        value={email}
        onChangeText={edit(setEmail)}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        error={problem === 'auth.errorInvalidEmail' ? t(problem) : undefined}
      />
      <Field
        label={t('auth.password')}
        value={password}
        onChangeText={edit(setPassword)}
        secureTextEntry
        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        hint={demo ? t('demo.signInHint') : t('auth.passwordHint')}
        error={problem === 'auth.errorWeakPassword' ? t(problem) : undefined}
        // Enter submits. People press it; a form that ignores it looks broken.
        returnKeyType="go"
        onSubmitEditing={() => void run(mode)}
      />

      {/* The question somebody asks at exactly the wrong moment. A link by
          email where the server can send one, the family admin's link where
          it cannot ((auth)/forgot.tsx decides). Not while creating an
          account - there is no password to forget yet. */}
      {mode === 'signIn' && !demo ? (
        <Touchable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/forgot', params: email.trim() ? { email: email.trim() } : {} })}
          hitSlop={8}
          style={{ alignSelf: 'flex-start' }}
        >
          <Text variant="caption" tone="primary">
            {t('auth.forgotPassword')}
          </Text>
        </Touchable>
      ) : null}

      {/* Field-specific problems sit under their field; the rest — nothing
          typed, a wrong password, no server — belong to the form. */}
      {problem && problem !== 'auth.errorInvalidEmail' && problem !== 'auth.errorWeakPassword' ? (
        <Text variant="body" tone="danger" accessibilityRole="alert">
          {t(problem)}
        </Text>
      ) : null}
    </View>
  );

  const actions = (
    <View style={{ gap: theme.spacing.md }}>
      <Button
        label={mode === 'register' ? t('auth.signUp') : t('auth.signIn')}
        size="lg"
        loading={loading}
        onPress={() => void run(mode)}
      />
      <Touchable
        // With both fields filled this does the other thing straight away,
        // as it always has; with either empty it only switches the form -
        // an error for a field nobody has reached yet would read as a scolding.
        onPress={() => {
          if (email.trim() && password) void run(other);
          else {
            setMode(other);
            setProblem(null);
          }
        }}
        accessibilityRole="button"
        give="row"
        disabled={loading}
      >
        <Text variant="caption" tone="primary" align="center">
          {mode === 'register'
            ? `${t('auth.haveAccount')} ${t('auth.signIn')}`
            : `${t('auth.noAccount')} ${t('auth.signUp')}`}
        </Text>
      </Touchable>

      {/* In both modes: with both fields filled, the line above creates the
          account straight away, so what it agrees to has to be on screen
          before that, not only after switching. */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="caption" tone="muted" align="center">
          {t('legal.agreeOnSignUp')}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.lg }}>
          <Touchable accessibilityRole="link" onPress={() => router.push('/legal/terms')} hitSlop={8}>
            <Text variant="caption" tone="primary">
              {t('legal.terms')}
            </Text>
          </Touchable>
          <Touchable accessibilityRole="link" onPress={() => router.push('/legal/privacy')} hitSlop={8}>
            <Text variant="caption" tone="primary">
              {t('legal.privacy')}
            </Text>
          </Touchable>
        </View>
      </View>
    </View>
  );

  if (front) {
    // The way apps open: the mark and the name, one line of what this is,
    // and the form under them. A column that scrolls, so a small phone with
    // its keyboard up still reaches the button.
    return (
      <Screen edges={['top', 'bottom']} scroll>
        <LanguageSwitch />
        <View style={{ gap: theme.spacing.md, paddingVertical: theme.spacing.lg }}>
          <Wordmark />
          <Text variant="body" tone="muted" align="center">
            {t('auth.heroTitle')}
          </Text>
        </View>
        {form}
        {actions}
        {/* The demo keeps nothing - said at its front door too, with the
            way to a family of one's own. */}
        {demo ? (
          <View style={{ gap: theme.spacing.xs, alignItems: 'center', paddingTop: theme.spacing.lg }}>
            <Text variant="caption" tone="muted" align="center">
              {t('demo.notice')}
            </Text>
            {canLeaveDemo() ? (
              <Touchable
                accessibilityRole="link"
                onPress={() => leaveDemo('signIn')}
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
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Header
        title={mode === 'register' ? t('auth.signUp') : t('auth.signIn')}
        onBack={() => goBack(router)}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'space-between' }}
      >
        <View style={{ marginTop: theme.spacing.xl }}>{form}</View>
        {actions}
      </KeyboardAvoidingView>
    </Screen>
  );
}
