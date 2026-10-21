import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { BirthDatePickerSheet } from '@/components/calendar/date-picker';
import { InterestPicker } from '@/components/family/interest-picker';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Field } from '@/components/ui/input';
import { Header, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { useApp, useCurrentMember } from '@/data/store';
import { track } from '@/domain/analytics';
import { cleanInterests, type InterestKey } from '@/domain/interests';
import { t, tf } from '@/i18n';
import { friendlyDay } from '@/lib/date';
import { notify } from '@/lib/dialog';
import { MIN_TEXT_LENGTH, isLongEnough } from '@/lib/form';
import { goBack } from '@/lib/navigation';
import { useTheme } from '@/theme';

/**
 * YOUR OWN NAME AND BIRTHDAY, AFTER ONBOARDING (item 29).
 *
 * Both used to be fixed the moment "About you" was left behind. A typo in a
 * name, a birthday skipped on the first screen of the app, the nickname the
 * family actually uses - none of it could be changed, and since the birthday
 * strip (item 46) a wrong birthday is announced to the whole family every
 * year.
 *
 * One name field rather than first and last: this is the name on the
 * timeline, and families call each other "Mum" and "Vecmāmiņa" at least as
 * often as by a given name. Onboarding splits it because a stranger's form
 * expects it to; the person editing it here already knows what they are
 * called at home.
 */
export default function EditProfile() {
  const theme = useTheme();
  const router = useRouter();

  const me = useCurrentMember();
  const session = useApp((s) => s.session);
  const updateMyProfile = useApp((s) => s.updateMyProfile);
  const setMyInterests = useApp((s) => s.setMyInterests);
  const setAvatar = useApp((s) => s.setAvatar);

  const [name, setName] = useState(me?.displayName ?? session?.user.displayName ?? '');
  const [birthDate, setBirthDate] = useState<string | undefined>(me?.birthDate);
  const [dateOpen, setDateOpen] = useState(false);
  const [triedToSave, setTriedToSave] = useState(false);
  // What you like, for the family's gift ideas (domain/interests.ts).
  const [interests, setInterests] = useState<InterestKey[]>(() => cleanInterests(me?.interests));

  const nameProblem =
    triedToSave && !isLongEnough(name)
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
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0] || !me) return;
    setAvatar(me.id, result.assets[0].uri);
  }

  function save() {
    // Pressable always, and the press explains - see lib/form.ts.
    if (!isLongEnough(name)) {
      setTriedToSave(true);
      return;
    }

    updateMyProfile({
      displayName: name.trim(),
      ...(birthDate !== me?.birthDate ? { birthDate } : null),
    });
    if (interests.join() !== cleanInterests(me?.interests).join()) {
      setMyInterests(interests);
      track({ name: 'interests_saved', count: interests.length, where: 'profile' });
    }
    goBack(router);
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
          contentContainerStyle={{ gap: theme.spacing.xl }}
        >
          <Header title={t('profile.editTitle')} onBack={() => goBack(router)} />

          {/* The face goes up as soon as it is picked (setAvatar), apart from
              Save: it is a file on its way to the server, not a field. */}
          <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
            <Avatar name={name || '?'} url={me?.avatarUrl} size="xl" />
            {me ? (
              <Button
                label={me.avatarUrl ? t('avatar.change') : t('avatar.add')}
                icon="camera"
                variant="ghost"
                onPress={() => void pickPhoto()}
              />
            ) : null}
          </View>

          <View style={{ gap: theme.spacing.lg }}>
            <Field
              label={t('profile.nameLabel')}
              hint={t('profile.nameHint')}
              value={name}
              onChangeText={setName}
              autoComplete="name"
              maxLength={60}
              error={nameProblem}
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
              <Text variant="caption" tone="muted">
                {t('profile.birthDateHint')}
              </Text>
            </View>

            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="body" tone="muted">
                {t('interests.title')}
              </Text>
              <Text variant="caption" tone="muted">
                {t('interests.profileHint')}
              </Text>
              <InterestPicker value={interests} onChange={setInterests} />
            </View>
          </View>
        </ScrollView>

        <Button label={t('common.save')} size="lg" onPress={save} />
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
