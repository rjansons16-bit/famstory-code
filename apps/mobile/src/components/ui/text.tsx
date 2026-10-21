import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme, type TypographyKey } from '@/theme';

export interface TextProps extends RNTextProps {
  variant?: TypographyKey;
  /** A semantic colour, not a hex. Hardcoded colours in screens are banned. */
  tone?: 'default' | 'muted' | 'primary' | 'danger' | 'onPrimary' | 'success';
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
}

export function Text({
  variant = 'body',
  tone = 'default',
  align,
  weight,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();

  const color = {
    default: theme.color.text,
    muted: theme.color.textMuted,
    primary: theme.color.primary,
    danger: theme.color.danger,
    onPrimary: theme.color.textOnPrimary,
    success: theme.color.success,
  }[tone];

  return (
    <RNText
      {...rest}
      style={[
        theme.typography[variant],
        { color },
        align ? { textAlign: align } : null,
        weight ? { fontWeight: weight } : null,
        style,
      ]}
    />
  );
}
