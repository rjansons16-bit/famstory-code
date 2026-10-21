import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { cssCurve, curve, useReducedMotion } from '@/lib/motion';
import { motion } from '@/theme';

/** How far a line rises as it arrives. */
const RISE = 14;

/**
 * One of the welcome screen's lines arriving after the mark: fading in as it
 * rises a little, `index` staggers after the first (motion.mark). On the web a
 * CSS animation - it plays from the first paint of the pre-rendered page and
 * leaves the page as it was, whole and readable, for anything that reads it
 * without running it; on a phone the native driver's. Reduced motion: there
 * from the start, still.
 */
export function Appear({ index, children }: { index: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const delay = motion.mark.linesAt + index * motion.mark.stagger;

  if (Platform.OS === 'web') {
    return <View style={reduced ? null : [webStyles?.rise, { animationDelay: `${delay}ms` } as ViewStyle]}>{children}</View>;
  }
  return (
    <NativeAppear delay={delay} moving={!reduced}>
      {children}
    </NativeAppear>
  );
}

function NativeAppear({ delay, moving, children }: { delay: number; moving: boolean; children: ReactNode }) {
  const [progress] = useState(() => new Animated.Value(moving ? 0 : 1));

  useEffect(() => {
    if (!moving) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(progress, { toValue: 1, duration: motion.slow, easing: curve('enter'), useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [delay, moving, progress]);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

// Keyframes only from a StyleSheet in react-native-web, and only on the web.
const webStyles =
  Platform.OS === 'web'
    ? StyleSheet.create({
        rise: {
          animationKeyframes: [
            {
              '0%': { opacity: 0, transform: `translateY(${RISE}px)` },
              '100%': { opacity: 1, transform: 'translateY(0)' },
            },
          ],
          animationDuration: `${motion.slow}ms`,
          animationTimingFunction: cssCurve('enter'),
          animationFillMode: 'both',
        } as unknown as ViewStyle,
      })
    : null;
