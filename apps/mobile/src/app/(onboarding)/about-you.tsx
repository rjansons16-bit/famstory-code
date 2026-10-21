import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { BirthDatePickerSheet } from '@/components/calendar/date-picker';
import { StepHeader } from '@/components/onboarding/step-header';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Field } from '@/components/ui/input';
import { Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { useApp } from '@/data/store';
import { track } from '@/domain/analytics';
import { t, tf } from '@/i18n';
import { friendlyDay } from '@/lib/date';
import { notify } from '@/lib/dialog';
import { MIN_TEXT_LENGTH, isLongEnough } from '@/lib/form';
import { useTheme } from '@/theme';

/**
 * STEP 1 — About you (`design/screens/design_Group_10_1.png`).
 *
 * A face, a name and a birthday: the three things the rest of the family sees
 * on every event this person ever writes. It is worth its own screen rather
 * than a field buried in a longer form.
 *
 * The photograph is picked but NOT uploaded — same as event photos, and for the
 * same reason: presigned uploads need a bucket that does not exist yet. The URI
 * is local to this device, which is honest for a prototype and wrong for a
 * family, so it stays on the Stage C list.
 */
export default function AboutYou() {
  const theme = useTheme();
  const router = useRouter();
  const updateMyProfile = useApp((s) => s.updateMyProfile);

  // TODO(api): prefill from the provider profile returned by POST /auth/{method}.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState<string | undefined>(undefined);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [dateOpen, setDateOpen] = useState(false);
  /**
   * Set by pressing Continue too early. From then on the field says what it
   * needs until it has it — the message goes away by itself as the second
   * letter is typed, rather than on the first keystroke.
   */
  const [triedToContinue, setTriedToContinue] = useState(false);
  const nameProblem =
    triedToContinue && !isLongEnough(firstName)
      ? tf('onboarding.firstNameTooShort', MIN_TEXT_LENGTH)
      : undefined;

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify(t('event.mediaPermissionTitle'), t('event.mediaPermissionBody'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    // TODO(api): POST /uploads/presign, upload, then keep the returned URL.
    setAvatarUrl(result.assets[0].uri);
  }

  function next() {
    // Pressable always, and the press explains — see lib/form.ts.
    if (!isLongEnough(firstName)) {
      setTriedToContinue(true);
      return;
    }

    updateMyProfile({
      displayName: [firstName.trim(), lastName.trim()].filter(Boolean).join(' '),
      birthDate,
      avatarUrl,
    });
    track({ name: 'onboarding_step_completed', step: 'about_you' });

    // What they like comes next; the family after that (interests.tsx).
    router.push('/(onboarding)/interests');
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'space-between' }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: theme.spacing.xl, paddingBottom: theme.spacing.xl }}
        >
          <StepHeader
            step={1}
            total={5}
            title={t('onboarding.profileTitle')}
            subtitle={t('onboarding.profileSubtitle')}
          />

          {/* The dashed ring says "there is nothing here yet" without needing a
              word for it — and the word is underneath anyway. */}
          <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
            <Touchable
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.addPhoto')}
              onPress={pickPhoto}
              style={{
                width: theme.size.avatarXl,
                height: theme.size.avatarXl,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.color.surfaceMuted,
                borderWidth: avatarUrl ? 0 : 1,
                borderStyle: 'dashed',
                borderColor: theme.color.textMuted,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              ) : (
                <Icon name="camera" size={28} tone="primary" />
              )}
            </Touchable>

            <Touchable accessibilityRole="button" onPress={pickPhoto} hitSlop={8} give="row">
              <Text variant="body" tone="primary">
                {t('onboarding.addPhoto')}
              </Text>
            </Touchable>
          </View>

          <View style={{ gap: theme.spacing.lg }}>
            <Field
              label={t('onboarding.firstName')}
              value={firstName}
              onChangeText={setFirstName}
              autoFocus
              autoComplete="name-given"
              maxLength={40}
              error={nameProblem}
            />
            <Field
              label={t('onboarding.lastName')}
              value={lastName}
              onChangeText={setLastName}
              autoComplete="name-family"
              maxLength={40}
            />

            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="body" tone="muted">
                {t('onboarding.birthDate')}
              </Text>
              <Touchable
                accessibilityRole="button"
                onPress={() => setDateOpen(true)}
                style={{
                  minHeight: theme.size.touchTarget,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: theme.color.border,
                  backgroundColor: theme.color.surface,
                  paddingHorizontal: theme.spacing.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                }}
              >
                <Text variant="body" tone={birthDate ? 'default' : 'muted'} style={{ flex: 1 }}>
                  {birthDate ? friendlyDay(birthDate) : t('onboarding.birthDateEmpty')}
                </Text>
                <Icon name="calendar" size={18} tone="muted" />
              </Touchable>
            </View>
          </View>
        </ScrollView>

        <Button label={t('onboarding.continue')} size="lg" onPress={next} />
      </KeyboardAvoidingView>

      <BirthDatePickerSheet
        visible={dateOpen}
        value={birthDate}
        onClose={() => setDateOpen(false)}
        onChange={setBirthDate}
      />
    </Screen>
  );
}
