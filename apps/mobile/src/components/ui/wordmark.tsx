import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Appear } from './appear';
import { LogoMark } from './logo-mark';
import { Text } from './text';

/**
 * The mark and the name, as the welcome screen opens on them.
 *
 * The mark (2026-09-30): a heart of two halves - two people leaning into each
 * other - and the child above them, the app icon's shape, so the first screen
 * and the home screen say the same thing. The comparison, and the two marks
 * before it, are in tools/brand/make-icons.mjs. The name stays FamStory, in the
 * design's serif.
 *
 * `animate`: the mark comes together and the name rises in after it, once, as
 * the page opens (components/ui/logo-mark.tsx). The heirloom sticker's print
 * has none.
 */
export function Wordmark({ name = 'FamStory', animate = false }: { name?: string; animate?: boolean }) {
  const theme = useTheme();
  const label = (
    <Text variant="wordmark" align="center">
      {name}
    </Text>
  );

  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.md }} accessibilityRole="header">
      {/* Decoration: the name below is what a screen reader says. */}
      <LogoMark width={theme.size.logoMark} animate={animate} />
      {animate ? <Appear index={0}>{label}</Appear> : label}
    </View>
  );
}
