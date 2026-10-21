import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { curve, duration, useReducedMotion } from '@/lib/motion';
import { motion, useTheme } from '@/theme';
import { Button, IconButton } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { Touchable } from './touchable';

// ---------------------------------------------------------------------------
// Empty state
//
// Retention is the study's critical risk, and an empty screen in the first
// session is exactly where a user is lost. So every empty state CARRIES AN
// ACTION, not just a message.
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.xxxl,
        paddingHorizontal: theme.spacing.xl,
        gap: theme.spacing.md,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.color.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={32} tone="primary" />
      </View>

      <Text variant="title" align="center">
        {title}
      </Text>

      {body ? (
        <Text variant="body" tone="muted" align="center">
          {body}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <View style={{ marginTop: theme.spacing.sm, alignSelf: 'stretch' }}>
          <Button label={actionLabel} onPress={onAction} icon="add" />
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bottom sheet
// ---------------------------------------------------------------------------

export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
  scroll = false,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Let the body scroll when it is taller than the room the sheet has, with the
   * title and the footer staying put. Off by default: sheets that list things
   * already bring their own scroll view, and two nested ones fight on Android.
   */
  scroll?: boolean;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();

  // The sheet itself slides up with the Modal. The scrim behind it fades on its
  // own: carried by the same slide, the dimming would sweep up from the bottom
  // edge like a blind, which says the wrong thing about what is happening.
  const [scrim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(scrim, {
      toValue: visible ? 1 : 0,
      duration: duration(motion.normal, reducedMotion),
      easing: curve(visible ? 'enter' : 'exit'),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [visible, scrim, reducedMotion]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Outer container with an explicit height: without it react-native-web
          lays the Modal content out below the page instead of over it. */}
      <View style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.color.overlay, opacity: scrim },
          ]}
        />

        {/* The tap target stays a plain view of its own, so dismissing the
            sheet never depends on where the fade above has got to. */}
        <Pressable
          accessibilityLabel={t('common.cancel')}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />

        <View
          style={{
            backgroundColor: theme.color.background,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            maxHeight: '85%',
            // Full width on a phone; on a computer, a sheet rather than a band
            // across the whole window.
            width: '100%',
            maxWidth: theme.size.sheetMaxWidth,
            alignSelf: 'center',
            ...theme.shadow.sheet,
          }}
        >
          {/* Shrinks with the sheet, so a scrolling body gets the room that is
              left rather than pushing the footer off the screen. */}
          <SafeAreaView edges={['bottom']} style={{ flexShrink: 1 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: theme.spacing.lg,
                paddingRight: theme.spacing.sm,
                paddingTop: theme.spacing.sm,
              }}
            >
              <Text variant="title" style={{ flex: 1 }}>
                {title}
              </Text>
              <IconButton name="close" onPress={onClose} accessibilityLabel={t('common.cancel')} />
            </View>

            {scroll ? (
              <ScrollView
                style={{ flexGrow: 0, flexShrink: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: theme.spacing.lg,
                  paddingBottom: theme.spacing.lg,
                }}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            ) : (
              <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
                {children}
              </View>
            )}

            {footer ? (
              <View
                style={{
                  paddingHorizontal: theme.spacing.lg,
                  paddingBottom: theme.spacing.lg,
                  borderTopWidth: 1,
                  borderTopColor: theme.color.border,
                  paddingTop: theme.spacing.lg,
                }}
              >
                {footer}
              </View>
            ) : null}
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Undo bar
//
// Shown after a destructive action, over whatever screen the user landed on.
// It has to outlive the screen the delete happened on — which is why it is
// mounted once at the root and driven from the store, not rendered locally.
// ---------------------------------------------------------------------------

export function UndoBar({
  token,
  message,
  actionLabel,
  onAction,
  onExpire,
  /** How long the offer stands. Long enough to notice, short enough not to nag. */
  durationMs = 6000,
}: {
  /**
   * Identifies WHICH thing can be undone — null when there is nothing.
   *
   * Not a boolean: two deletes in a row leave `visible` true throughout, so the
   * effect would never re-run and the second one would inherit whatever was
   * left of the first one's window. The id changes, so the timer restarts.
   */
  token: string | null;
  message: string;
  actionLabel: string;
  onAction: () => void;
  onExpire: () => void;
  durationMs?: number;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(onExpire, durationMs);
    return () => clearTimeout(timer);
  }, [token, durationMs, onExpire]);

  if (!token) return null;

  return (
    <View
      // Above the tab bar, not over it — covering navigation to show a message
      // about something that already happened is the wrong trade.
      style={{
        position: 'absolute',
        // Painted above the navigator, and — the part that is easy to miss —
        // able to RECEIVE the tap. Without an explicit stacking order the bar
        // is visible but the press goes straight through to the card behind it,
        // which on the timeline means opening an event instead of undoing one.
        zIndex: 1000,
        left: theme.spacing.lg,
        right: theme.spacing.lg,
        bottom: insets.bottom + 72,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radius.md,
        backgroundColor: theme.color.text,
        ...theme.shadow.sheet,
      }}
    >
      <Text variant="body" style={{ flex: 1, color: theme.color.background }}>
        {message}
      </Text>

      <Touchable onPress={onAction} hitSlop={12} accessibilityRole="button" give="row">
        <Text variant="label" style={{ color: theme.color.background }}>
          {actionLabel}
        </Text>
      </Touchable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Error bar
//
// The other half of an optimistic write. The change is on screen before the
// server has agreed to it, so when the server refuses, something has to say so
// — otherwise the user is looking at a memory that exists only on their phone.
//
// Mounted once at the root, like the undo bar and for the same reason: the
// write may have happened on a screen they have already left.
// ---------------------------------------------------------------------------

export function ErrorBar({
  error,
  onDismiss,
}: {
  error: { code: string; message: string } | null;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  if (!error) return null;

  return (
    <View
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        zIndex: 1001,
        left: theme.spacing.lg,
        right: theme.spacing.lg,
        bottom: insets.bottom + 72,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radius.md,
        backgroundColor: theme.color.dangerSoft,
        borderWidth: 1,
        borderColor: theme.color.danger,
        ...theme.shadow.sheet,
      }}
    >
      <Icon name="warning" size={18} color={theme.color.danger} />

      <Text variant="caption" tone="danger" style={{ flex: 1 }}>
        {error.message}
      </Text>

      <Touchable onPress={onDismiss} hitSlop={12} accessibilityRole="button" give="row">
        <Text variant="label" tone="danger">
          {t('common.done')}
        </Text>
      </Touchable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// AI suggestion banner
//
// Always two choices. It never applies itself.
// Rationale: docs/00-PLAN.md, section 3.
// ---------------------------------------------------------------------------

export function SuggestionBanner({
  message,
  onAccept,
  onDismiss,
  acceptLabel,
  dismissLabel,
}: {
  message: string;
  onAccept: () => void;
  onDismiss: () => void;
  /** Defaults to "Accept" / "No thanks" — override for non-AI banners. */
  acceptLabel?: string;
  dismissLabel?: string;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.color.accentSoft,
      }}
    >
      <Icon name="sparkle" size={18} color={theme.color.accentText} />

      <Text variant="caption" style={{ flex: 1 }}>
        {message}
      </Text>

      <Touchable onPress={onDismiss} hitSlop={8} give="row">
        <Text variant="label" tone="muted">
          {dismissLabel ?? t('ai.dismiss')}
        </Text>
      </Touchable>

      <Touchable onPress={onAccept} hitSlop={8} give="row">
        <Text variant="label" style={{ color: theme.color.accentText }}>
          {acceptLabel ?? t('ai.accept')}
        </Text>
      </Touchable>
    </View>
  );
}
