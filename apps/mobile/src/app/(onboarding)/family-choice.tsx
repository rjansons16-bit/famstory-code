import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { StepHeader } from '@/components/onboarding/step-header';
import { ActionCard } from '@/components/ui/action-card';
import { Screen } from '@/components/ui/surface';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { goBack } from '@/lib/navigation';

/**
 * STEP 3 — the family.
 *
 * The two branches part here and never rejoin. Creating means three more steps;
 * joining means one, because a family that already exists already has its
 * people and its chronicle.
 */
export default function FamilyChoice() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen edges={['top', 'bottom']}>
      <StepHeader
        step={3}
        total={5}
        title={t('onboarding.choiceTitle')}
        subtitle={t('onboarding.choiceSubtitle')}
        onBack={() => goBack(router)}
      />

      <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
        <ActionCard
          icon="family"
          title={t('onboarding.createFamily')}
          hint={t('onboarding.createFamilyHint')}
          onPress={() => router.push('/(onboarding)/create-family')}
        />
        <ActionCard
          icon="link"
          title={t('onboarding.joinFamily')}
          hint={t('onboarding.joinFamilyHint')}
          onPress={() => router.push('/(onboarding)/join-family')}
        />
      </View>
    </Screen>
  );
}
