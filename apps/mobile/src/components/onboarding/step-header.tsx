import { View } from 'react-native';

import { IconButton } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { t, tf } from '@/i18n';
import { useTheme } from '@/theme';

export interface StepHeaderProps {
  title: string;
  subtitle?: string;
  /** Omitted on a screen that ends onboarding rather than continuing it. */
  step?: number;
  total?: number;
  onBack?: () => void;
}

/**
 * The head of every onboarding screen, as the design draws it
 * (`design/screens/design_Group_10_1.png`).
 *
 * A back chevron on the left and a row of dots centred beside it — the dot for
 * the step you are on stretches into a short bar. The count is not written out;
 * it is read out instead, so the row still answers "where am I" for anyone who
 * cannot see the shape.
 *
 * The title is the serif. Onboarding is the one part of the app that speaks in
 * the product's own voice rather than labelling controls, and the design sets
 * every one of these headings in Fraunces.
 */
export function StepHeader({ title, subtitle, step, total, onBack }: StepHeaderProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {onBack ? (
          <View style={{ marginLeft: -theme.spacing.md }}>
            <IconButton name="back" onPress={onBack} accessibilityLabel={t('common.back')} />
          </View>
        ) : null}

        {step && total ? (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={tf('onboarding.step', step, total)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.xs,
              marginRight: onBack ? theme.size.touchTarget : 0,
            }}
          >
            {Array.from({ length: total }, (_, i) => (
              <View
                key={i}
                style={{
                  width: i === step - 1 ? 22 : 7,
                  height: 7,
                  borderRadius: theme.radius.pill,
                  backgroundColor: i === step - 1 ? theme.color.primary : theme.color.border,
                }}
              />
            ))}
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title">{title}</Text>
        {subtitle ? (
          <Text variant="body" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
