import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { StepHeader } from '@/components/onboarding/step-header';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { Screen } from '@/components/ui/surface';
import { useApp } from '@/data/store';
import { track } from '@/domain/analytics';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { goBack } from '@/lib/navigation';

/** The shortest thing that could be a code. The real ones look like FAM-1234. */
const MIN_CODE_LENGTH = 4;

/**
 * STEP 3, join branch — and the end of onboarding.
 *
 * No counter here. The family being joined already has its people and its
 * chronicle, so there is nothing left to ask; showing "2 of 4" would promise
 * two steps that never arrive.
 */
export default function JoinFamily() {
  const theme = useTheme();
  const router = useRouter();
  const joinFamily = useApp((s) => s.joinFamily);
  const completeOnboarding = useApp((s) => s.completeOnboarding);

  // Somebody who arrived through an invitation link has already handed the
  // app its code; asking them to type it again is asking them to find it.
  const pendingInviteCode = useApp((s) => s.pendingInviteCode);
  const [code, setCode] = useState(pendingInviteCode ?? '');
  const [joining, setJoining] = useState(false);
  const [triedToJoin, setTriedToJoin] = useState(false);

  const complete = code.trim().length >= MIN_CODE_LENGTH;

  async function join() {
    // Pressable always, and the press explains — see lib/form.ts.
    if (!complete) {
      setTriedToJoin(true);
      return;
    }

    // A code that is wrong, used or expired is refused by the server, and the
    // reason is in the bar at the top. The screen stays, with the code still
    // typed, rather than finishing onboarding into a family that was not joined.
    setJoining(true);
    const joined = await joinFamily(code.trim());
    setJoining(false);
    if (!joined) return;

    completeOnboarding();
    track({ name: 'onboarding_completed', peopleAdded: 0, firstEventCreated: false });
    router.replace('/(tabs)');
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'space-between' }}
      >
        <View style={{ gap: theme.spacing.xl }}>
          <StepHeader
            title={t('onboarding.joinCodeTitle')}
            subtitle={t('onboarding.joinCodeSubtitle')}
            onBack={() => goBack(router)}
          />

          <Field
            placeholder={t('onboarding.joinCodePlaceholder')}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            returnKeyType="go"
            onSubmitEditing={() => void join()}
            error={triedToJoin && !complete ? t('onboarding.joinCodeIncomplete') : undefined}
          />
        </View>

        <Button
          label={t('onboarding.joinFamily')}
          size="lg"
          loading={joining}
          onPress={() => void join()}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}
