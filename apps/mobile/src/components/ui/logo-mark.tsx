import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Image, Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { cssCurve, curve, useReducedMotion } from '@/lib/motion';
import { motion, useTheme } from '@/theme';
import { MARK_LAYERS, MARK_RATIO } from './mark-layers';

export { MARK_RATIO };

// The mark in three layers on one canvas, drawn by tools/brand/make-icons.mjs
// and kept as data (mark-layers.ts): the left half and the child follow the
// ground, the right half is Jade. As data, on the web they are in the
// pre-rendered page itself - there at the first paint, when the CSS animation
// starts, rather than a request later, by when the mark would have come
// together unseen (it did, 2026-09-30).
const LEFT = { uri: MARK_LAYERS.left };
const LEFT_DARK = { uri: MARK_LAYERS.leftDark };
const RIGHT = { uri: MARK_LAYERS.right };
const CHILD = { uri: MARK_LAYERS.child };
const CHILD_DARK = { uri: MARK_LAYERS.childDark };

// Everything waits `startAt` for the layers to arrive: on the web they come
// with the pre-rendered page, a moment after its first paint.
const { startAt, meet, land, beat } = motion.mark;
const landAt = startAt + motion.mark.landAt;
const beatAt = startAt + motion.mark.beatAt;

/**
 * THE MARK: a heart of two halves - two people leaning into each other, one in
 * the ground's ink and one in Jade - and the child above them (2026-09-30;
 * tools/brand/make-icons.mjs says why this one).
 *
 * With `animate` it comes together once, as the app does when it opens: the
 * halves swing in from either side and meet, the child lands on top, the heart
 * beats. On the web that is a CSS animation, which the browser runs on its own
 * from the first paint - in the pre-rendered page too, before any script - and
 * off the main thread; on a phone, the native driver's. Reduced motion shows
 * it whole and still, from the start.
 */
export function LogoMark({ width, animate = false }: { width: number; animate?: boolean }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const moving = animate && !reduced;
  const dark = theme.mode === 'dark';
  const height = width / MARK_RATIO;

  const layers = (
    parts: { left: ViewStyle | null; right: ViewStyle | null; child: ViewStyle | null },
  ) => (
    <>
      <Layer source={dark ? LEFT_DARK : LEFT} style={parts.left} />
      <Layer source={RIGHT} style={parts.right} />
      <Layer source={dark ? CHILD_DARK : CHILD} style={parts.child} />
    </>
  );

  if (Platform.OS === 'web') {
    return (
      <View
        style={[{ width, height }, moving ? webStyles?.beat : null]}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {layers({
          left: moving ? (webStyles?.left ?? null) : null,
          right: moving ? (webStyles?.right ?? null) : null,
          child: moving ? (webStyles?.child ?? null) : null,
        })}
      </View>
    );
  }

  return <NativeMark width={width} height={height} moving={moving} layers={layers} />;
}

/**
 * One layer. React Native's own Image, not expo-image: on the web it is part
 * of the pre-rendered page, where expo-image draws its picture only once the
 * page's script has run.
 */
function Layer({ source, style }: { source: { uri: string }; style: ViewStyle | null }) {
  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <Image source={source} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessible={false} />
    </View>
  );
}

/** On a phone: the same moves on the native driver, from the moment it mounts. */
function NativeMark({
  width,
  height,
  moving,
  layers,
}: {
  width: number;
  height: number;
  moving: boolean;
  layers: (parts: { left: ViewStyle | null; right: ViewStyle | null; child: ViewStyle | null }) => ReactNode;
}) {
  const [halves] = useState(() => new Animated.Value(moving ? 0 : 1));
  const [child] = useState(() => new Animated.Value(moving ? 0 : 1));
  const [pulse] = useState(() => new Animated.Value(moving ? 0 : 1));

  useEffect(() => {
    if (!moving) {
      halves.setValue(1);
      child.setValue(1);
      pulse.setValue(1);
      return;
    }
    const animation = Animated.parallel([
      Animated.sequence([
        Animated.delay(startAt),
        Animated.timing(halves, { toValue: 1, duration: meet, easing: curve('pop'), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(landAt),
        Animated.timing(child, { toValue: 1, duration: land, easing: curve('pop'), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(beatAt),
        Animated.timing(pulse, { toValue: 1, duration: beat, easing: curve('inOut'), useNativeDriver: true }),
      ]),
    ]);
    animation.start();
    return () => animation.stop();
  }, [moving, halves, child, pulse]);

  const swing = (side: 1 | -1) =>
    ({
      opacity: halves.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
      transformOrigin: 'bottom',
      transform: [
        { translateX: halves.interpolate({ inputRange: [0, 1], outputRange: [side * 0.28 * width, 0] }) },
        { rotate: halves.interpolate({ inputRange: [0, 1], outputRange: [`${side * 16}deg`, '0deg'] }) },
      ],
    }) as unknown as ViewStyle;

  return (
    <Animated.View
      style={{
        width,
        height,
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 1.08, 1] }) }],
      }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {layers({
        left: swing(-1),
        right: swing(1),
        child: {
          opacity: child.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
          transform: [
            { translateY: child.interpolate({ inputRange: [0, 1], outputRange: [-0.6 * height, 0] }) },
            { scale: child.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
          ],
        } as unknown as ViewStyle,
      })}
    </Animated.View>
  );
}

/**
 * The web's CSS animations. Keyframes only work from a StyleSheet in
 * react-native-web, never inline, and only there - a phone would warn about a
 * style it does not know - so they exist only on the web. `both`: before its
 * delay a part is still apart, after its end it stays together.
 */
const webStyles =
  Platform.OS === 'web'
    ? StyleSheet.create({
        left: web({
          transformOrigin: '50% 100%',
          animationKeyframes: [
            {
              '0%': { opacity: 0, transform: 'translateX(-28%) rotate(-16deg)' },
              '40%': { opacity: 1 },
              '100%': { opacity: 1, transform: 'translateX(0) rotate(0deg)' },
            },
          ],
          animationDuration: `${meet}ms`,
          animationDelay: `${startAt}ms`,
          animationTimingFunction: cssCurve('pop'),
          animationFillMode: 'both',
        }),
        right: web({
          transformOrigin: '50% 100%',
          animationKeyframes: [
            {
              '0%': { opacity: 0, transform: 'translateX(28%) rotate(16deg)' },
              '40%': { opacity: 1 },
              '100%': { opacity: 1, transform: 'translateX(0) rotate(0deg)' },
            },
          ],
          animationDuration: `${meet}ms`,
          animationDelay: `${startAt + 40}ms`,
          animationTimingFunction: cssCurve('pop'),
          animationFillMode: 'both',
        }),
        child: web({
          animationKeyframes: [
            {
              '0%': { opacity: 0, transform: 'translateY(-60%) scale(0.6)' },
              '30%': { opacity: 1 },
              '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
            },
          ],
          animationDuration: `${land}ms`,
          animationDelay: `${landAt}ms`,
          animationTimingFunction: cssCurve('pop'),
          animationFillMode: 'both',
        }),
        beat: web({
          animationKeyframes: [
            { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.08)' }, '100%': { transform: 'scale(1)' } },
          ],
          animationDuration: `${beat}ms`,
          animationDelay: `${beatAt}ms`,
          animationTimingFunction: cssCurve('inOut'),
          animationFillMode: 'both',
        }),
      })
    : null;

/** A web-only style: react-native-web's CSS animation keys, which React Native's types do not name. */
function web(style: Record<string, unknown>): ViewStyle {
  return style as ViewStyle;
}
