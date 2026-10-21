import { View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Card } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import type { Birthday } from '@/domain/birthdays';
import { t, tf } from '@/i18n';
import { inDaysLabel, weekdayAndDay } from '@/lib/date';
import { useTheme } from '@/theme';

/**
 * BIRTHDAYS ON SCREEN.
 *
 * Two shapes for the same fact, because they answer different questions.
 *
 *   - The strip on the timeline is a warning: something is coming, and there
 *     is still time to buy a present. It is the only thing on the timeline
 *     that is about the future and not the past, so it says when, in days, and
 *     not as a date nobody counts from.
 *   - The row on a calendar day is an answer: you went looking at that day,
 *     and this is what is on it.
 *
 * Neither is a card with a photograph. A birthday is not a memory the family
 * wrote down, and dressing it as one would put a fake entry in the archive.
 */

/** How near a birthday is, said the way the strip says it. */
const whenLabel = inDaysLabel;

export function UpcomingBirthdays({
  birthdays,
  onSelect,
}: {
  birthdays: Birthday[];
  onSelect?: (birthday: Birthday) => void;
}) {
  const theme = useTheme();

  // Nothing in the next month. An empty "no birthdays" line would be a
  // permanent fixture for a family of two.
  if (birthdays.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
      <Text variant="body" tone="muted">
        {t('birthday.upcoming')}
      </Text>

      <Card padded={false}>
        {birthdays.map((birthday, index) => (
          <Touchable
            key={birthday.member.id}
            onPress={onSelect ? () => onSelect(birthday) : undefined}
            accessibilityRole={onSelect ? 'button' : undefined}
            accessibilityLabel={`${tf(
              'birthday.turns',
              birthday.member.displayName,
              birthday.turning,
            )} ${whenLabel(birthday.inDays)}`}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                padding: theme.spacing.md,
                // One card, several people: a line between them, never above
                // the first or below the last.
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: theme.color.border,
              }}
            >
              <Avatar name={birthday.member.displayName} url={birthday.member.avatarUrl} size="sm" />

              <View style={{ flex: 1 }}>
                <Text variant="body">
                  {tf('birthday.turns', birthday.member.displayName, birthday.turning)}
                </Text>
                <Text variant="label" tone="muted">
                  {`${whenLabel(birthday.inDays)} · ${weekdayAndDay(birthday.day)}`}
                </Text>
              </View>

              <Icon name="gift" tone="muted" />
            </View>
          </Touchable>
        ))}
      </Card>
    </View>
  );
}

/** One birthday under a calendar day, next to that day's events. */
export function BirthdayRow({
  birthday,
  onPress,
}: {
  birthday: Birthday;
  onPress?: () => void;
}) {
  const theme = useTheme();

  return (
    <Card onPress={onPress} padded={false}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          padding: theme.spacing.md,
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: theme.radius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.color.primarySoft,
          }}
        >
          <Icon name="gift" />
        </View>

        <View style={{ flex: 1 }}>
          <Text variant="body">
            {tf('birthday.turns', birthday.member.displayName, birthday.turning)}
          </Text>
          <Text variant="label" tone="muted">
            {t('birthday.label')}
          </Text>
        </View>
      </View>
    </Card>
  );
}
