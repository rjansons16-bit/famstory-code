import { useState, type ReactNode } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { curve, duration, useReducedMotion } from '@/lib/motion';
import { motion } from '@/theme';

/**
 * A pressable that answers the finger.
 *
 * Every touchable thing in the app goes through here, so that the answer is the
 * same everywhere and reduced motion is honoured in one place rather than
 * eleven. `give` says what KIND of thing is being pressed, not how far it
 * should move — the numbers live in `theme/tokens.ts` under `motion.press`.
 *
 * It snaps down and eases back: pressing is the user's action and should be
 * immediate, while releasing is the app letting go, and letting go abruptly is
 * what makes an interface feel brittle.
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressGive = keyof typeof motion.press;

export interface TouchableProps extends Omit<PressableProps, 'style' | 'children'> {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** What is being pressed: a card, a row, a control, a round button. */
  give?: PressGive;
  /**
   * Resting opacity. The press dims FROM here, so a control that is already
   * faded because it is disabled does not fade a second time on touch.
   */
  opacity?: number;
}

export function Touchable({
  children,
  style,
  give = 'control',
  opacity = 1,
  onPressIn,
  onPressOut,
  ...rest
}: TouchableProps) {
  const reduced = useReducedMotion();
  const [held] = useState(() => new Animated.Value(0));
  const feel = motion.press[give];

  const settle = (to: number, ms: number, shape: 'inOut' | 'enter') => {
    Animated.timing(held, {
      toValue: to,
      duration: duration(ms, reduced),
      easing: curve(shape),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        settle(1, motion.fast, 'inOut');
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        settle(0, motion.normal, 'enter');
        onPressOut?.(event);
      }}
      style={[
        style,
        {
          opacity: held.interpolate({
            inputRange: [0, 1],
            outputRange: [opacity, opacity * feel.opacity],
          }),
          // Movement is the part reduced motion removes. The dimming above
          // stays: a control that answers nothing at all reads as broken
          // rather than as calm.
          transform:
            reduced || feel.scale === 1
              ? []
              : [
                  {
                    scale: held.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, feel.scale],
                    }),
                  },
                ],
        },
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}
