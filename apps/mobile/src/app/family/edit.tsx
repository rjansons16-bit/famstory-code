import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { Header, Screen } from '@/components/ui/surface';
import { useApp, useCurrentMember } from '@/data/store';
import { can } from '@/domain/visibility';
import { t, tf } from '@/i18n';
import { MIN_TEXT_LENGTH, isLongEnough } from '@/lib/form';
import { goBack } from '@/lib/navigation';
import { useTheme } from '@/theme';

/**
 * THE FAMILY'S NAME, changed by an administrator.
 *
 * The create-family screen has always said it "can be changed later", and
 * until this screen there was no way to: the server took a new name
 * (PATCH /families/:id) and nothing in the app sent one. The same field and
 * the same limits as when the family was named (create-family.tsx); the
 * server checks them again (families.service.ts, familyName).
 */
export default function EditFamily() {
  const theme = useTheme();
  const router = useRouter();
  const family = useApp((s) => s.family);
  const renameFamily = useApp((s) => s.renameFamily);
  const me = useCurrentMember();

  const [name, setName] = useState(family?.name ?? '');
  const [triedToSave, setTriedToSave] = useState(false);

  // Only an administrator reaches the pencil; a link typed by hand goes back.
  if (!family || !me || !can(me, 'family.edit')) return <Redirect href="/family" />;

  function save() {
    // Pressable always, and the press explains - see lib/form.ts.
    if (!isLongEnough(name)) {
      setTriedToSave(true);
      return;
    }
    renameFamily(name);
    goBack(router);
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'space-between' }}
      >
        <View style={{ gap: theme.spacing.xl }}>
          <Header title={t('family.nameTitle')} onBack={() => goBack(router)} />

          <Field
            label={t('family.nameTitle')}
            hint={t('family.nameHint')}
            placeholder={t('onboarding.familyNamePlaceholder')}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={save}
            error={
              triedToSave && !isLongEnough(name)
                ? tf('onboarding.familyNameTooShort', MIN_TEXT_LENGTH)
                : undefined
            }
          />
        </View>

        <Button label={t('common.save')} size="lg" onPress={save} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
