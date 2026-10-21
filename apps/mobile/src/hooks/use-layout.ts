import { useWindowDimensions } from 'react-native';

import { useTheme } from '@/theme';

/**
 * Which layout the window is wide enough for (docs/07-IMPROVEMENTS.md item 39).
 *
 * A phone never reaches either breakpoint, so on a phone nothing here changes
 * anything: the tab bar stays at the bottom and the timeline is one column.
 * The web build on a laptop is where a family meets the product first, and
 * that is who these are for.
 */
export function useLayout(): { rail: boolean; columns: 1 | 2 } {
  const { width } = useWindowDimensions();
  const { size } = useTheme();
  return {
    rail: width >= size.railBreakpoint,
    columns: width >= size.twoColumnBreakpoint ? 2 : 1,
  };
}
