import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { StepHeader } from '@/components/onboarding/step-header';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { Screen } from '@/components/ui/surface';
import { useApp } from '@/data/store';
import { track } from '@/domain/analytics';
import { t, tf } from '@/i18n';
import { MIN_TEXT_LENGTH, isLongEnough } from '@/lib/form';
import { goBack } from '@/lib/navigation';
import { useTheme } from '@/theme';

/** STEP 3, create branch — naming the family. */
export default function CreateFamily() {
  const theme = useTheme();
  const router = useRouter();
  const createFamily = useApp((s) => s.createFamily);

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [triedToContinue, setTriedToContinue] = useState(false);

  async function next() {
    // Pressable always, and the press explains — see lib/form.ts.
    if (!isLongEnough(name)) {
      setTriedToContinue(true);
      return;
    }

    // Awaited: the next screen adds people to this family, and it needs the
    // family to exist and to have an id first. If it does not, the reason is in
    // the bar at the top and this screen stays, name and all, to try again.
    setSaving(true);
    const created = await createFamily(name.trim());
    setSaving(false);
    if (!created) return;

    track({ name: 'onboarding_step_completed', step: 'family' });
    router.push('/(onboarding)/people');
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'space-between' }}
      >
        <View style={{ gap: theme.spacing.xl }}>
          <StepHeader
            step={3}
            total={5}
            title={t('onboarding.familyNameTitle')}
            subtitle={t('onboarding.familyNameSubtitle')}
            onBack={() => goBack(router)}
          />

          <Field
            placeholder={t('onboarding.familyNamePlaceholder')}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={60}
            returnKeyType="next"
            onSubmitEditing={() => void next()}
            error={
              triedToContinue && !isLongEnough(name)
                ? tf('onboarding.familyNameTooShort', MIN_TEXT_LENGTH)
                : undefined
            }
          />
        </View>

        <Button
          label={t('onboarding.continue')}
          size="lg"
          loading={saving}
          onPress={() => void next()}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}
