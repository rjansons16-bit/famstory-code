import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Icon, type IconName } from './icon';
import { Card } from './surface';
import { Text } from './text';

/**
 * A choice presented as a white card: a round icon plate, what it is, what it
 * does, and a chevron. The design uses this shape wherever a screen offers two
 * or three ways forward — creating or joining a family, and the three ways to
 * add a person (`design/screens/design_Group_9_1.png`).
 *
 * The subtitle is not decoration. Every one of these choices commits the user
 * to something different, and the second line is where that difference is said
 * out loud rather than left to the title to imply.
 */
export function ActionCard({
  icon,
  title,
  hint,
  tone = 'neutral',
  onPress,
}: {
  icon: IconName;
  title: string;
  hint: string;
  /** `accent` tints the icon plate — the design uses it to mark the child option. */
  tone?: 'neutral' | 'accent';
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Card onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: theme.radius.pill,
            backgroundColor:
              tone === 'accent' ? theme.color.accentSoft : theme.color.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={22} tone="primary" />
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">{title}</Text>
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        </View>

        <Icon name="forward" size={18} tone="muted" />
      </View>
    </Card>
  );
}
