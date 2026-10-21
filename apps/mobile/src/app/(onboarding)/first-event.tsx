import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { DatePickerSheet } from '@/components/calendar/date-picker';
import { StepHeader } from '@/components/onboarding/step-header';
import { Button } from '@/components/ui/button';
import { CategoryChip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Field } from '@/components/ui/input';
import { Card, Row, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { useApp } from '@/data/store';
import { track } from '@/domain/analytics';
import { CATEGORIES } from '@/domain/categories';
import type { CategoryId } from '@/domain/types';
import { t, tf } from '@/i18n';
import { eventTimeLabel, startOfDay } from '@/lib/date';
import { MIN_TEXT_LENGTH, isLongEnough } from '@/lib/form';
import { goBack } from '@/lib/navigation';
import { useTheme } from '@/theme';

/**
 * STEP 5 — the first event.
 *
 * The KPI is "families with 3 or more events (>50%)", and a family that leaves
 * onboarding with an empty timeline mostly never comes back to fill it. So the
 * first one is written here, while the reason for signing up is still fresh.
 *
 * This is NOT the composer. Photos, participants, reminders, tags, milestones
 * and the visibility sheet all stay in `event/new.tsx` — a first-run screen
 * asking seven questions is how a chronicle turns back into paperwork. Three
 * fields, and everything else takes its default:
 *
 *   - all-day, because "what day was it" is the only time question that
 *     matters for a memory;
 *   - visible to the whole family, which is stated in words on the screen
 *     rather than left for the user to discover;
 *   - no participants, because at this point the family is usually just you.
 */
export default function FirstEvent() {
  const theme = useTheme();
  const router = useRouter();

  const members = useApp((s) => s.members);
  const invitations = useApp((s) => s.invitations);
  const addEvent = useApp((s) => s.addEvent);
  const completeOnboarding = useApp((s) => s.completeOnboarding);

  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(() => startOfDay(new Date()).toISOString());
  const [categoryId, setCategoryId] = useState<CategoryId>('other');
  const [dateOpen, setDateOpen] = useState(false);
  const [triedToSave, setTriedToSave] = useState(false);

  function finish(created: boolean) {
    completeOnboarding();
    track({
      name: 'onboarding_completed',
      // Everyone but the author, plus the invitations still outstanding.
      peopleAdded: members.length - 1 + invitations.length,
      firstEventCreated: created,
    });
    router.replace('/(tabs)');
  }

  function save() {
    // Pressable always, and the press explains — see lib/form.ts.
    if (!isLongEnough(title)) {
      setTriedToSave(true);
      return;
    }

    addEvent({
      title: title.trim(),
      startsAt,
      allDay: true,
      categoryId,
      participantMemberIds: [],
      visibility: { kind: 'family' },
      attachments: [],
      tags: [],
      isMilestone: false,
    });
    track({ name: 'onboarding_step_completed', step: 'first_event' });
    finish(true);
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'space-between' }}
      >
        <View style={{ gap: theme.spacing.xl }}>
          <StepHeader
            step={5}
            total={5}
            title={t('onboarding.firstEventTitle')}
            subtitle={t('onboarding.firstEventSubtitle')}
            onBack={() => goBack(router)}
          />

          <View style={{ gap: theme.spacing.lg }}>
            <Field
              label={t('event.titleLabel')}
              placeholder={t('event.titlePlaceholder')}
              value={title}
              onChangeText={setTitle}
              autoFocus
              maxLength={120}
              error={
                triedToSave && !isLongEnough(title)
                  ? tf('event.titleTooShort', MIN_TEXT_LENGTH)
                  : undefined
              }
            />

            <Card elevation="flat" padded={false}>
              <View style={{ paddingHorizontal: theme.spacing.lg }}>
                <Row
                  title={t('event.dateLabel')}
                  left={<Icon name="calendar" tone="muted" />}
                  right={
                    <Text variant="body" tone="primary">
                      {eventTimeLabel(startsAt, true)}
                    </Text>
                  }
                  onPress={() => setDateOpen(true)}
                />
              </View>
            </Card>

            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="body" tone="muted">
                {t('event.categoryLabel')}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  {CATEGORIES.map((c) => (
                    <CategoryChip
                      key={c.id}
                      categoryId={c.id}
                      selected={categoryId === c.id}
                      onPress={() => setCategoryId(c.id)}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          {/* Visibility is not asked here, so it is said instead. An event whose
              audience the user cannot name is exactly what this product exists
              to avoid. */}
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
          >
            <Icon name="visibility" size={14} tone="muted" />
            <Text variant="caption" tone="muted" style={{ flex: 1 }}>
              {t('onboarding.firstEventHint')}
            </Text>
          </View>

          <Button label={t('common.save')} size="lg" onPress={save} />
          <Button label={t('onboarding.skipForNow')} variant="ghost" onPress={() => finish(false)} />
        </View>
      </KeyboardAvoidingView>

      <DatePickerSheet
        visible={dateOpen}
        value={startsAt}
        allDay
        onClose={() => setDateOpen(false)}
        onChange={setStartsAt}
      />
    </Screen>
  );
}
