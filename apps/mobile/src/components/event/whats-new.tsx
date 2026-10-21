import { View } from 'react-native';

import { t, tf } from '@/i18n';
import { sinceLabel } from '@/lib/date';
import { useTheme } from '@/theme';
import { Text } from '../ui/text';
import { Touchable } from '../ui/touchable';

/**
 * "4 new since Tuesday" over the timeline, and a way to see just those.
 *
 * A line rather than a sort order: the timeline stays in the order things
 * happened, which is what makes it a chronicle, and the banner answers the
 * other question - what did the others add - by filtering to it on a tap.
 * Nothing when nothing is new: a "0 new" line is noise every day nobody posts.
 */
export function WhatsNewBanner({
  count,
  since,
  onlyNew,
  onToggle,
}: {
  count: number;
  since: string | null;
  /** Whether the timeline below is showing only the new ones. */
  onlyNew: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  if (count === 0 || !since) return null;

  const message = tf('whatsNew.banner', count, sinceLabel(since));
  const action = onlyNew ? t('whatsNew.showAll') : t('whatsNew.show');

  return (
    <Touchable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`${message}. ${action}`}
      give="row"
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radius.md,
          backgroundColor: theme.color.primarySoft,
        }}
      >
        <NewDot />
        <Text variant="body" style={{ flex: 1 }}>
          {message}
        </Text>
        <Text variant="label" tone="primary">
          {action}
        </Text>
      </View>
    </Touchable>
  );
}

/** The mark on a card that is new since the last visit. */
export function NewMark() {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
      <NewDot />
      <Text variant="label" tone="primary">
        {t('whatsNew.mark')}
      </Text>
    </View>
  );
}

function NewDot() {
  const theme = useTheme();
  return (
    <View
      style={{
        width: theme.spacing.sm,
        height: theme.spacing.sm,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.color.primary,
      }}
    />
  );
}
