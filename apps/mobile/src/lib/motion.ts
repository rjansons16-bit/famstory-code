/**
 * How motion is decided.
 *
 * The character and the numbers live in `theme/tokens.ts` under `motion`; this
 * is the one file that turns them into curves and durations, for the same
 * reason `media.ts` is the one file that applies the photograph rule — so that
 * "reduced motion" cannot be honoured on four screens and forgotten on the
 * fifth.
 *
 * Reduced motion here means exactly that: no movement, not a slower version of
 * it. Durations become zero and nothing translates or scales; only opacity
 * still changes, because a control that gives no feedback at all reads as
 * broken rather than as calm.
 */

import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Easing } from 'react-native';

import { motion } from '@/theme';

export type EasingFn = (value: number) => number;

/** One of the named curves, ready for `Animated.timing`. */
export function curve(name: keyof typeof motion.curve): EasingFn {
  const [x1, y1, x2, y2] = motion.curve[name];
  return Easing.bezier(x1, y1, x2, y2);
}

/**
 * The same curve for a CSS animation, which the web runs by itself - from the
 * first paint of a pre-rendered page, before any script has loaded, and off
 * the main thread (components/ui/logo-mark.tsx, components/ui/appear.tsx).
 */
export function cssCurve(name: keyof typeof motion.curve): string {
  const [x1, y1, x2, y2] = motion.curve[name];
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}

/**
 * A duration, or nothing at all when the system has asked for reduced motion.
 * Zero rather than one frame: `Animated.timing` with `duration: 0` still fires
 * its completion callback, so anything waiting on the end of an animation keeps
 * working.
 */
export function duration(ms: number, reduced: boolean): number {
  return reduced ? 0 : ms;
}

/*
 * One reading of the system setting, shared by everything that asks.
 *
 * Every touchable in the app calls `useReducedMotion`, so a screen can easily
 * have thirty of them. A subscription each would be thirty listeners on the
 * same platform event for one boolean — so the listener is opened once, on the
 * first ask, and the value is handed out from here.
 *
 * It is never closed. The setting lives as long as the process does, and
 * tearing the listener down when the last pressable unmounts would only mean
 * re-opening it on the next screen.
 */
let reducedMotion = false;
let watching = false;
const watchers = new Set<() => void>();

function announce(value: boolean) {
  if (value === reducedMotion) return;
  reducedMotion = value;
  for (const notify of watchers) notify();
}

function watchReducedMotion(notify: () => void) {
  watchers.add(notify);

  if (!watching) {
    watching = true;
    // iOS "Reduce Motion", Android "Remove animations", and on the web the
    // `prefers-reduced-motion` media query — react-native-web maps all three
    // onto this one API.
    void AccessibilityInfo.isReduceMotionEnabled().then(announce);
    AccessibilityInfo.addEventListener('reduceMotionChanged', announce);
  }

  return () => {
    watchers.delete(notify);
  };
}

/**
 * Whether the system has asked for less movement.
 *
 * Starts `false`: the first read is asynchronous, and assuming motion is wanted
 * means the rare user who turned it on sees one animated frame, rather than
 * everyone seeing the app start still.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    watchReducedMotion,
    () => reducedMotion,
    () => false,
  );
}

/**
 * How long a photograph takes to fade in once it has decoded.
 *
 * Only for photographs that ARE the content — an event's cover, the hero on an
 * opened event, the "On this day" tiles. Avatars, the calendar grid and the
 * thumbnails in the composer get none: thirty small pictures fading in at once
 * is not gentle, it is a flicker.
 */
export function usePhotoTransition(): number {
  const reduced = useReducedMotion();
  return duration(motion.slow, reduced);
}
