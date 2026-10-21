/**
 * Theme access. Screens import ONLY from here, never from tokens.ts directly —
 * that is what makes dark mode work without any extra work per screen.
 */

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  categoryTone,
  colors,
  media,
  motion,
  onMedia,
  radius,
  scannable,
  shadow,
  size,
  spacing,
  typography,
  type ColorScheme,
  type ToneColors,
  type ToneKey,
  type TypographyKey,
} from './tokens';

export interface Theme {
  mode: 'light' | 'dark';
  color: ColorScheme;
  tone: Record<ToneKey, ToneColors>;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadow: typeof shadow;
  size: typeof size;
  motion: typeof motion;
  /** Fixed colours for text and scrims over a photograph — the same in both themes. */
  onMedia: typeof onMedia;
  /** How a photograph meets a card. Shape, not colour, so it does not vary either. */
  media: typeof media;
  /** Black on white for a camera to read — the same in both themes, see tokens.ts. */
  scannable: typeof scannable;
}

export function useTheme(): Theme {
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  return {
    mode,
    color: colors[mode],
    tone: categoryTone[mode],
    spacing,
    radius,
    typography,
    shadow,
    size,
    motion,
    onMedia,
    media,
    scannable,
  };
}

export {
  colors,
  spacing,
  radius,
  typography,
  shadow,
  size,
  motion,
  categoryTone,
  onMedia,
  media,
  scannable,
};
export type { ColorScheme, ToneColors, ToneKey, TypographyKey };
