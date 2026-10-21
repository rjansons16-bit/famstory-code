import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useLayout } from '@/hooks/use-layout';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { Icon } from './icon';
import { Text } from './text';
import { Touchable } from './touchable';

/**
 * The "+" in the middle of the tab bar.
 *
 * The design puts it there rather than floating over the content, and that is a
 * better decision than the floating button it replaces: a FAB in the corner
 * covers the bottom-right of every card it passes, which on this timeline is
 * exactly where the comment count and the visibility badge sit.
 *
 * It is NOT a tab. It opens the composer as a modal and the current tab stays
 * selected underneath — so it renders its own button rather than letting the
 * navigator treat it as a destination.
 *
 * On a computer, where the tabs are a rail down the left, it is a button with
 * its words in the rail instead: a circle lifted out of a bar makes sense only
 * where there is a bar.
 */
export function ComposeTabButton() {
  const theme = useTheme();
  const router = useRouter();
  const { rail } = useLayout();

  if (rail) {
    return (
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={t('event.new')}
        onPress={() => router.push('/event/new')}
        give="row"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          marginVertical: theme.spacing.md,
          marginHorizontal: theme.spacing.xs,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.color.primary,
        }}
      >
        <Icon name="add" size={22} tone="onPrimary" />
        <Text variant="button" tone="onPrimary">
          {t('event.new')}
        </Text>
      </Touchable>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start' }}>
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={t('event.new')}
        onPress={() => router.push('/event/new')}
        give="round"
        // The circle IS the button, so the touch target grows around the circle
        // rather than filling the tab slot — otherwise a press at the edge of
        // the slot animates something the finger is nowhere near.
        hitSlop={{ top: 18, bottom: 12, left: 16, right: 16 }}
        style={{
          // Lifted above the bar so the circle reads as a button rather than
          // a fifth tab that happens to be round.
          marginTop: -18,
          width: theme.size.fab,
          height: theme.size.fab,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.color.primary,
          alignItems: 'center',
          justifyContent: 'center',
          ...theme.shadow.fab,
        }}
      >
        <Icon name="add" size={26} tone="onPrimary" />
      </Touchable>
    </View>
  );
}
