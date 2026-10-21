/**
 * Confirmations and notices that work on every platform.
 *
 * WHY THIS EXISTS: `Alert.alert` is a silent no-op on react-native-web. Not a
 * warning, not a fallback — nothing happens. Every confirmation written with it
 * left a dead button on the web build, including "delete event".
 *
 * That matters more than it sounds: the web build is what design and review run
 * against (docs/04-DESIGN-BRIEF.md), so a flow that only works on a device is a
 * flow nobody looks at until the beta.
 */

import { Alert, Platform } from 'react-native';

/**
 * Ask before doing something destructive. Resolves true when confirmed.
 *
 * Always a promise, on both platforms: `Alert.alert` is callback-based and
 * `window.confirm` is synchronous, and letting that difference reach the call
 * sites is how you end up with two versions of every delete handler.
 */
export function confirm(options: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    // `window.confirm` cannot show a custom button label, so the question has to
    // carry the meaning by itself. Native gets the labelled buttons.
    const text = options.message ? `${options.title}\n\n${options.message}` : options.title;
    return Promise.resolve(globalThis.confirm?.(text) ?? false);
  }

  return new Promise((resolve) => {
    Alert.alert(options.title, options.message, [
      { text: options.cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: options.confirmLabel,
        style: options.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

/** A message with nothing to decide. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
