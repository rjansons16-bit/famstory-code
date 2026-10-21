import { ActivityIndicator, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { Touchable } from './touchable';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  disabled,
  loading,
  fullWidth = true,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const surface: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: theme.color.primary },
    secondary: {
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: theme.color.dangerSoft },
  };

  const tone = {
    primary: 'onPrimary',
    secondary: 'default',
    ghost: 'primary',
    danger: 'danger',
  }[variant] as 'onPrimary' | 'default' | 'primary' | 'danger';

  const height = size === 'lg' ? 56 : theme.size.touchTarget;

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={onPress}
      disabled={isDisabled}
      opacity={isDisabled ? 0.45 : 1}
      style={[
        {
          height,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.sm,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        surface[variant],
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? theme.color.textOnPrimary : theme.color.primary}
        />
      ) : (
        <>
          {icon ? <Icon name={icon} tone={tone} size={20} /> : null}
          {/* Inter, not the display serif: a button is chrome, not content. */}
          <Text variant="button" tone={tone}>
            {label}
          </Text>
          {iconRight ? <Icon name={iconRight} tone={tone} size={20} /> : null}
        </>
      )}
    </Touchable>
  );
}

export interface IconButtonProps {
  name: IconName;
  onPress?: () => void;
  tone?: 'default' | 'muted' | 'primary' | 'danger';
  /** Dot in the top-right corner — unread notifications. */
  badge?: boolean;
  /** Shown, but faded and inert: the date picker's arrow at the last month it allows. */
  disabled?: boolean;
  accessibilityLabel: string;
}

export function IconButton({
  name,
  onPress,
  tone = 'default',
  badge,
  disabled,
  accessibilityLabel,
}: IconButtonProps) {
  const theme = useTheme();

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={disabled ? { disabled: true } : undefined}
      disabled={disabled}
      opacity={disabled ? 0.35 : 1}
      onPress={onPress}
      hitSlop={8}
      give="row"
      style={{
        width: theme.size.touchTarget,
        height: theme.size.touchTarget,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} tone={tone} />
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 9,
            height: 9,
            borderRadius: 999,
            backgroundColor: theme.color.danger,
            borderWidth: 2,
            borderColor: theme.color.background,
          }}
        />
      ) : null}
    </Touchable>
  );
}
