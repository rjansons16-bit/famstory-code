import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { Touchable } from './touchable';

/**
 * A labelled field that opens a sheet instead of a keyboard.
 *
 * The design writes the composer as a form: a grey label, then a white box
 * holding the CURRENT ANSWER and a chevron
 * (`design/screens/design_Screenshot_2026-07-01_at_20_55_28_1.png`). That is
 * why the event type is not a row of ten chips any more — a form field says
 * what the answer is now; a chip row makes you find it.
 */
export function SelectBox({
  label,
  value,
  icon,
  onPress,
}: {
  label: string;
  value: string;
  icon?: IconName;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="body" tone="muted">
        {label}
      </Text>

      <Touchable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={onPress}
        style={{
          minHeight: theme.size.touchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surface,
        }}
      >
        {icon ? <Icon name={icon} size={18} tone="muted" /> : null}
        <Text variant="body" style={{ flex: 1 }}>
          {value}
        </Text>
        <Icon name="forward" size={16} tone="muted" />
      </Touchable>
    </View>
  );
}
