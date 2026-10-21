import { View } from 'react-native';

import { useApp } from '@/data/store';
import { groupLabel } from '@/domain/groups';
import type { Visibility } from '@/domain/types';
import { describeVisibility } from '@/domain/visibility';
import { t, tf } from '@/i18n';
import { useTheme } from '@/theme';
import { Icon } from '../ui/icon';
import { Text } from '../ui/text';

/**
 * "Parents, Grandparents" — always visible, no tap required.
 *
 * The study names privacy control as the main differentiator. A differentiator
 * you cannot see does not exist, which is why this badge sits on EVERY event
 * card, not only on the edit screen.
 */
export function VisibilityBadge({
  visibility,
  compact,
}: {
  visibility: Visibility;
  compact?: boolean;
}) {
  const theme = useTheme();
  const groups = useApp((s) => s.groups);
  const members = useApp((s) => s.members);

  const label = describeVisibility(
    visibility,
    {
      groupName: (id) => {
        const group = groups.find((g) => g.id === id);
        return group ? groupLabel(group) : '?';
      },
      memberName: (id) => members.find((m) => m.id === id)?.displayName ?? '?',
    },
    {
      family: t('visibility.family'),
      private: t('visibility.private'),
      andMore: (n) => tf('visibility.andMore', n),
    },
  );

  const restricted = visibility.kind !== 'family';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
      <Icon
        name={visibility.kind === 'private' ? 'private' : restricted ? 'group' : 'visibility'}
        size={13}
        color={restricted ? theme.color.accentText : theme.color.textMuted}
      />
      <Text
        variant="caption"
        numberOfLines={1}
        // accentText, not accent: the line that says who can see an entry
        // is the one line on the card that must never be hard to read.
        style={{ color: restricted ? theme.color.accentText : theme.color.textMuted }}
      >
        {compact ? label : label}
      </Text>
    </View>
  );
}
