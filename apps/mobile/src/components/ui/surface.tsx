import type { ReactNode } from 'react';
import {
  ScrollView,
  View,
  type ScrollViewProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { IconButton } from './button';
import { Text } from './text';
import { Touchable } from './touchable';

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export interface ScreenProps {
  children?: ReactNode;
  /** Scrollable content. For lists (FlatList) use `scroll={false}`. */
  scroll?: boolean;
  padded?: boolean;
  edges?: readonly Edge[];
  /** Extra bottom padding when the screen has a pinned bottom button. */
  bottomInset?: number;
  /** Pull-to-refresh. Only reaches the list when `scroll` is on. */
  refreshControl?: ScrollViewProps['refreshControl'];
  /**
   * A wider column, for a screen laid out in two columns on a computer
   * (the timeline, hooks/use-layout.ts). Everything else keeps the reading width.
   */
  wide?: boolean;
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top'],
  bottomInset = 0,
  refreshControl,
  wide = false,
}: ScreenProps) {
  const theme = useTheme();
  const padding = padded ? theme.spacing.lg : 0;

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={{
        padding,
        paddingBottom: padding + bottomInset + theme.spacing.xxl,
        gap: theme.spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding }}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: theme.color.background }}>
      {/* A column, not the window: on a phone this is the whole width and
          changes nothing; on a computer it stops every screen from being
          stretched edge to edge (size.contentMaxWidth). */}
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: wide ? theme.size.contentMaxWidthWide : theme.size.contentMaxWidth,
          alignSelf: 'center',
        }}
      >
        {body}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export interface HeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}

export function Header({ title, subtitle, onBack, right }: HeaderProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        minHeight: theme.size.touchTarget,
      }}
    >
      {onBack ? (
        <View style={{ marginLeft: -theme.spacing.md }}>
          <IconButton name="back" onPress={onBack} accessibilityLabel={t('common.back')} />
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        <Text variant={onBack ? 'title' : 'display'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export interface CardProps extends ViewProps {
  children: ReactNode;
  onPress?: () => void;
  padded?: boolean;
  /** `flat` — no shadow, border only. For lists with many cards. */
  elevation?: 'flat' | 'raised';
}

export function Card({
  children,
  onPress,
  padded = true,
  elevation = 'raised',
  style,
  ...rest
}: CardProps) {
  const theme = useTheme();

  const base: ViewStyle = {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: padded ? theme.spacing.lg : 0,
    // A warm hairline on every card, raised or flat. On a parchment ground a
    // soft grey blur reads as smudge; an ink-coloured edge reads as paper. The
    // raised variant keeps a shadow too, but a much quieter one — the border is
    // now doing the work of separating the card from the page.
    borderWidth: 1,
    borderColor: theme.color.border,
    overflow: 'hidden',
    ...(elevation === 'raised' ? theme.shadow.card : {}),
  };

  if (onPress) {
    return (
      <Touchable
        accessibilityRole="button"
        onPress={onPress}
        give="card"
        style={[base, style as ViewStyle]}
      >
        {children}
      </Touchable>
    );
  }

  return (
    <View {...rest} style={[base, style]}>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.color.border }} />;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.sm,
      }}
    >
      {/* Sentence case, like every other label the design draws. */}
      <Text variant="body" tone="muted">
        {title}
      </Text>
      {action}
    </View>
  );
}

export function Spacer({ size = 'lg' }: { size?: keyof ReturnType<typeof useTheme>['spacing'] }) {
  const theme = useTheme();
  return <View style={{ height: theme.spacing[size] }} />;
}

/**
 * A list row with an icon, a title and a right-hand slot.
 * Used in settings, the family list and the picker sheets.
 */
export function Row({
  title,
  subtitle,
  left,
  right,
  onPress,
  danger,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const theme = useTheme();

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: theme.size.touchTarget,
        paddingVertical: theme.spacing.sm,
      }}
    >
      {left}
      <View style={{ flex: 1 }}>
        <Text variant="heading" tone={danger ? 'danger' : 'default'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );

  if (!onPress) return content;

  return (
    <Touchable accessibilityRole="button" onPress={onPress} give="row">
      {content}
    </Touchable>
  );
}
