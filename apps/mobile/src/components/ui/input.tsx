import { useState, type ReactNode } from 'react';
import { Switch, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from './text';

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  hint?: string;
  error?: string;
  /** Multi-line field — description, comment. */
  multiline?: boolean;
  /** Something small on the label's line, at the far end: the dictation button. */
  accessory?: ReactNode;
}

export function Field({ label, hint, error, multiline, accessory, ...rest }: FieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {/* Sentence case, at reading size. The design writes "First name", not
          "FIRST NAME" — small caps above every box is form-filling language,
          and this app is meant to feel like writing rather than filing. */}
      {label || accessory ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="body" tone="muted" style={{ flex: 1 }}>
            {label}
          </Text>
          {accessory}
        </View>
      ) : null}

      <TextInput
        {...rest}
        multiline={multiline}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        placeholderTextColor={theme.color.textMuted}
        style={{
          minHeight: multiline ? 96 : theme.size.touchTarget,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: error
            ? theme.color.danger
            : focused
              ? theme.color.primary
              : theme.color.border,
          backgroundColor: theme.color.surface,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: multiline ? theme.spacing.md : 0,
          color: theme.color.text,
          textAlignVertical: multiline ? 'top' : 'center',
          ...theme.typography.body,
        }}
      />

      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function SwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: theme.size.touchTarget,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="heading">{title}</Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: theme.color.primary, false: theme.color.border }}
        thumbColor={theme.color.surface}
      />
    </View>
  );
}
