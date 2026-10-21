import { useColorScheme as useDeviceColorScheme } from 'react-native';

import { resolveColorScheme, useAppearance } from '@/data/appearance';

/**
 * The scheme the app draws in: the choice made on the Profile screen, or the
 * device's when the choice is "follow the device". The theme reads only this,
 * so a change reaches every screen at once. See data/appearance.ts.
 */
export function useColorScheme(): 'light' | 'dark' {
  const device = useDeviceColorScheme();
  const preference = useAppearance((s) => s.preference);
  return resolveColorScheme(preference, device);
}
