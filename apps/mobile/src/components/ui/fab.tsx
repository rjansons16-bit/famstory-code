import { useTheme } from '@/theme';
import { Icon } from './icon';
import { Touchable } from './touchable';

/**
 * The floating "+" button.
 *
 * User flow 3 in the study begins with "the user presses the + button". So it
 * lives in one place, is always visible, and has no competitor on the screen.
 */
export function Fab({
  onPress,
  bottom = 88,
  accessibilityLabel,
}: {
  onPress: () => void;
  bottom?: number;
  accessibilityLabel: string;
}) {
  const theme = useTheme();

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      give="round"
      style={{
        position: 'absolute',
        right: theme.spacing.lg,
        bottom,
        width: theme.size.fab,
        height: theme.size.fab,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.color.primary,
        alignItems: 'center',
        justifyContent: 'center',
        ...theme.shadow.fab,
      }}
    >
      <Icon name="add" size={28} tone="onPrimary" />
    </Touchable>
  );
}
