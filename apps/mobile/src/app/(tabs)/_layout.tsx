import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComposeTabButton } from '@/components/ui/compose-tab-button';
import { Icon, type IconName } from '@/components/ui/icon';
import { useWhatsNew } from '@/data/store';
import { useLayout } from '@/hooks/use-layout';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * Tab bar icon components.
 *
 * They live at MODULE level, not inside the component, for two reasons:
 *   1. React Compiler does not allow mutating a function object (`displayName`)
 *      during render.
 *   2. A stable reference means the icon is not remounted on every render.
 *
 * `color` here is RN's `ColorValue`, not `string` — it can be an opaque
 * platform object, so we stringify it.
 */
function makeTabIcon(name: IconName) {
  function TabIcon({ color }: { color: string | number | object }) {
    return <Icon name={name} color={String(color)} />;
  }
  TabIcon.displayName = `TabIcon(${name})`;
  return TabIcon;
}

const TimelineIcon = makeTabIcon('timeline');
const CalendarIcon = makeTabIcon('calendar');
const FamilyIcon = makeTabIcon('family');
const ProfileIcon = makeTabIcon('profile');

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // What the others added since the last visit, on the tab it is waiting in -
  // seen from the calendar or the family screen, where the banner is not.
  const newCount = useWhatsNew().length;
  // On a computer the tabs are a rail down the left (hooks/use-layout.ts).
  const { rail } = useLayout();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.primary,
        tabBarInactiveTintColor: theme.color.textMuted,
        tabBarPosition: rail ? 'left' : 'bottom',
        tabBarVariant: rail ? 'material' : 'uikit',
        tabBarLabelPosition: rail ? 'beside-icon' : 'below-icon',
        tabBarStyle: rail
          ? {
              backgroundColor: theme.color.surface,
              borderRightColor: theme.color.border,
              borderRightWidth: 1,
              width: theme.size.rail,
              // The navigator gives a labelled rail a 360 minimum (the Material
              // drawer width) - a third of a laptop screen for five short words.
              minWidth: theme.size.rail,
              paddingTop: theme.spacing.xl,
              paddingHorizontal: theme.spacing.sm,
            }
          : {
              backgroundColor: theme.color.surface,
              borderTopColor: theme.color.border,
              // A height given here replaces the navigator's whole calculation,
              // so the inset it would have added is added back by hand. The
              // navigator still pads the bottom by the inset itself.
              height: theme.size.tabBar + insets.bottom,
              // The same column as the screens above it. Full width, a
              // tablet spread four tabs across the screen with nothing between.
              width: '100%',
              maxWidth: theme.size.contentMaxWidth,
              alignSelf: 'center',
            },
        tabBarLabelStyle: theme.typography.label,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab.timeline'),
          tabBarIcon: TimelineIcon,
          tabBarBadge: newCount > 0 ? newCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.color.primary,
            color: theme.color.textOnPrimary,
            ...theme.typography.label,
          },
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: t('tab.calendar'), tabBarIcon: CalendarIcon }}
      />
      {/* The middle slot. Not a destination — see ComposeTabButton. */}
      <Tabs.Screen
        name="compose"
        options={{ title: '', tabBarButton: ComposeTabButton }}
      />
      <Tabs.Screen
        name="family"
        options={{ title: t('tab.family'), tabBarIcon: FamilyIcon }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tab.profile'), tabBarIcon: ProfileIcon }}
      />
    </Tabs>
  );
}
