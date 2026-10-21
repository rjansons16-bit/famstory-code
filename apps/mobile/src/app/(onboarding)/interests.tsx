import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { InterestPicker } from '@/components/family/interest-picker';
import { StepHeader } from '@/components/onboarding/step-header';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/surface';
import { useApp } from '@/data/store';
import { track } from '@/domain/analytics';
import type { InterestKey } from '@/domain/interests';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { goBack } from '@/lib/navigation';

/**
 * STEP 2 — what you like (docs/07-IMPROVEMENTS.md item 91).
 *
 * Asked here, while somebody is already saying who they are, because this is
 * the one moment everybody in the family passes through - and the gift ideas
 * before their birthday are only as good as this list. Taps, not typing, and
 * skipping costs nothing: it can be changed on the profile any time.
 *
 * The family does not exist yet, so the choice waits in the store for the
 * member row that creating or joining one makes (`setMyInterests`).
 */
export default function Interests() {
  const theme = useTheme();
  const router = useRouter();
  const setMyInterests = useApp((s) => s.setMyInterests);
  const pendingInviteCode = useApp((s) => s.pendingInviteCode);
  const kept = useApp((s) => s.pendingProfile.interests);
  const [chosen, setChosen] = useState<InterestKey[]>(() => [...(kept ?? [])]);

  function next() {
    setMyInterests(chosen);
    if (chosen.length > 0) track({ name: 'interests_saved', count: chosen.length, where: 'onboarding' });
    track({ name: 'onboarding_step_completed', step: 'interests' });

    // Somebody who arrived through an invitation link is not choosing between
    // creating and joining - they were invited to one particular family, and
    // the choice screen is where that gets lost.
    router.push(
      pendingInviteCode ? '/(onboarding)/join-family' : '/(onboarding)/family-choice',
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.spacing.xl, paddingBottom: theme.spacing.xl }}
        >
          <StepHeader
            step={2}
            total={5}
            title={t('interests.onboardingTitle')}
            subtitle={t('interests.onboardingSubtitle')}
            onBack={() => goBack(router)}
          />
          <InterestPicker value={chosen} onChange={setChosen} />
        </ScrollView>

        <Button
          label={chosen.length > 0 ? t('onboarding.continue') : t('onboarding.skipForNow')}
          variant={chosen.length > 0 ? 'primary' : 'secondary'}
          size="lg"
          onPress={next}
        />
      </View>
    </Screen>
  );
}
